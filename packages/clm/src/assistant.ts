import { and, desc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
import {
  ASSISTANT_DISCLAIMERS,
  ambiguousTurn,
  assistantLogFields,
  citation,
  classifyIntent,
  createNoneAdapter,
  extractPlainText,
  groundAssistantTurn,
  insufficientTurn,
  refuseInjectionTurn,
  searchQueryFromMessage,
  unsupportedTurn,
  type AssistantCitation,
  type AssistantSource,
  type AssistantTurn,
  type LlmAdapter,
} from "@accordiq/ai";
import { AppError, isAppError, likeContains, parseInput } from "@accordiq/core";
import { can, type Actor } from "@accordiq/auth";
import {
  assistantCitation,
  assistantMessage,
  assistantProposal,
  assistantThread,
  assistantToolCall,
  clauseAlternative,
  clauseTemplate,
  clauseUsage,
  clauseVersion,
  contract,
  contractVersion,
  obligation,
  organization,
  renewalWatch,
  vendor,
  type Database,
} from "@accordiq/db";
import { addIsoDays, calendarDate, resolveTimeZone } from "./calendar";
import { id, notFound, requirePermission, writeAudit } from "./helpers";
import { formatMinorAmount } from "./money";
import type { ClmOptions, PublicDocument } from "./repository";
import { sendAssistantMessageSchema } from "./validation";

const UPCOMING_HORIZON_DAYS = 90;
const OPEN_OBLIGATION = ["OPEN", "OVERDUE"] as const;
const WATCH_STATUSES = ["WATCHING", "NOTICE_DUE", "DECISION_PENDING"] as const;

type FileHelpers = {
  scopedContract: (
    organizationId: string,
    contractId: string,
  ) => Promise<typeof contract.$inferSelect>;
  getDocumentFile: (
    actor: Actor,
    documentId: string,
  ) => Promise<{ bytes: Uint8Array; contentType: string; fileName: string; byteSize: number }>;
  listDocuments: (actor: Actor, contractId: string) => Promise<PublicDocument[]>;
};

type ToolLog = {
  toolName: string;
  input: Record<string, string | number | boolean | null>;
  result: Record<string, string | number | boolean | null>;
  durationMs: number;
};

function iso(value: Date): string {
  return value.toISOString();
}

function threadTitle(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function parseTemplateIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function recordSnapshot(row: typeof contract.$inferSelect): string {
  return [
    row.title,
    row.status,
    row.effectiveOn,
    row.expiresOn,
    row.currency,
    row.valueMinor != null ? String(row.valueMinor) : "",
    row.autoRenew ? "auto-renew" : "no auto-renew",
    row.noticeDays != null ? `${row.noticeDays} days` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function storedFacts(
  question: string,
  row: typeof contract.$inferSelect,
): { line: string; quote: string }[] {
  const q = question.toLowerCase();
  const facts: { line: string; quote: string }[] = [];
  const valueAsked = /\b(value|fee|price|amount|stated)\b/.test(q);
  const endAsked = /\b(expir|end date|term ends)\b/.test(q);
  const startAsked = /\b(effective|start date)\b/.test(q);
  const renewAsked = /\bauto.?renew/.test(q);
  const noticeAsked = /\bnotice\b/.test(q);
  const titleAsked = /\btitle\b/.test(q);
  if (valueAsked && row.valueMinor != null && row.currency) {
    facts.push({
      line: `Stored contract-stated value: ${formatMinorAmount(row.valueMinor, row.currency)} (${row.valueMinor} ${row.currency} minor units).`,
      quote: String(row.valueMinor),
    });
  }
  if (endAsked && row.expiresOn) {
    facts.push({ line: `Stored end date: ${row.expiresOn}.`, quote: row.expiresOn });
  }
  if (startAsked && row.effectiveOn) {
    facts.push({ line: `Stored effective date: ${row.effectiveOn}.`, quote: row.effectiveOn });
  }
  if (renewAsked) {
    facts.push({
      line: `Stored auto-renew flag: ${row.autoRenew ? "yes" : "no"}. This is a flag, not a renewal action.`,
      quote: row.autoRenew ? "auto-renew" : "no auto-renew",
    });
  }
  if (noticeAsked && row.noticeDays != null) {
    facts.push({
      line: `Stored notice period: ${row.noticeDays} days.`,
      quote: `${row.noticeDays} days`,
    });
  }
  if (titleAsked) {
    facts.push({ line: `Stored title: ${row.title}.`, quote: row.title });
  }
  return facts;
}

function messageStatus(turn: AssistantTurn): "COMPLETED" | "REFUSED" | "UNAVAILABLE" | "FAILED" {
  if (turn.intent === "INJECTION" || turn.intent === "UNSUPPORTED") return "REFUSED";
  if (turn.answer?.includes("AI is not connected")) return "UNAVAILABLE";
  if (turn.insufficientEvidence) return "REFUSED";
  return "COMPLETED";
}

function logAssistant(fields: Parameters<typeof assistantLogFields>[0]): void {
  console.info("[accordiq:assistant]", JSON.stringify(assistantLogFields(fields)));
}

function isUniqueFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const cause =
    error instanceof Error && error.cause instanceof Error ? error.cause.message.toLowerCase() : "";
  return (
    message.includes("unique") ||
    message.includes("constraint") ||
    cause.includes("unique") ||
    cause.includes("sqlite_constraint")
  );
}

export function createAssistantAccess(db: Database, options: ClmOptions, helpers: FileHelpers) {
  const clock = () => options.clock?.() ?? new Date();
  const llm: LlmAdapter = options.llm ?? createNoneAdapter();

  async function scopedThread(organizationId: string, userId: string, threadId: string) {
    const row = await db.query.assistantThread.findFirst({
      where: and(
        eq(assistantThread.id, threadId),
        eq(assistantThread.organizationId, organizationId),
        eq(assistantThread.createdByUserId, userId),
      ),
    });
    if (!row) notFound();
    return row;
  }

  async function scopedProposal(organizationId: string, proposalId: string) {
    const row = await db.query.assistantProposal.findFirst({
      where: and(
        eq(assistantProposal.id, proposalId),
        eq(assistantProposal.organizationId, organizationId),
      ),
    });
    if (!row) notFound();
    return row;
  }

  function toCitationView(row: typeof assistantCitation.$inferSelect) {
    return {
      id: row.id,
      sourceKind: row.sourceKind,
      quote: row.quote,
      page: row.page,
      contractId: row.contractId,
      documentId: row.documentId,
      clauseTemplateId: row.clauseTemplateId,
      obligationId: row.obligationId,
      href: row.href,
    };
  }

  function toProposalView(row: typeof assistantProposal.$inferSelect) {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      body: row.body,
      templateIds: parseTemplateIds(row.templateIdsJson),
      createdContractId: row.createdContractId,
    };
  }

  async function loadThreadBundle(organizationId: string, userId: string, threadId: string) {
    const thread = await scopedThread(organizationId, userId, threadId);
    const [messages, proposals] = await Promise.all([
      db
        .select()
        .from(assistantMessage)
        .where(
          and(
            eq(assistantMessage.threadId, threadId),
            eq(assistantMessage.organizationId, organizationId),
          ),
        )
        .orderBy(assistantMessage.createdAt),
      db
        .select()
        .from(assistantProposal)
        .where(
          and(
            eq(assistantProposal.threadId, threadId),
            eq(assistantProposal.organizationId, organizationId),
          ),
        ),
    ]);
    const messageIds = messages.map((row) => row.id);
    const citationsByMessage =
      messageIds.length === 0
        ? []
        : await db
            .select()
            .from(assistantCitation)
            .where(
              and(
                eq(assistantCitation.organizationId, organizationId),
                inArray(assistantCitation.messageId, messageIds),
              ),
            );
    return {
      thread: {
        id: thread.id,
        title: thread.title,
        createdAt: iso(thread.createdAt),
        updatedAt: iso(thread.updatedAt),
      },
      messages: messages.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        intent: row.intent,
        status: row.status,
        insufficientEvidence: row.insufficientEvidence,
        disclaimer: row.disclaimer,
        createdAt: iso(row.createdAt),
        citations: citationsByMessage
          .filter((item) => item.messageId === row.id)
          .map(toCitationView),
        proposal:
          proposals.filter((item) => item.messageId === row.id).map(toProposalView)[0] ?? null,
      })),
    };
  }

  async function runTool<T>(
    logs: ToolLog[],
    toolName: string,
    input: Record<string, string | number | boolean | null>,
    fn: () => Promise<T>,
    summarize: (value: T) => Record<string, string | number | boolean | null>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const value = await fn();
      logs.push({
        toolName,
        input,
        result: summarize(value),
        durationMs: Date.now() - started,
      });
      return value;
    } catch (error) {
      logs.push({
        toolName,
        input,
        result: {
          ok: false,
          code: isAppError(error) ? error.code : "INTERNAL",
        },
        durationMs: Date.now() - started,
      });
      throw error;
    }
  }

  async function pickAuthorizedDocument(actor: Actor, contractId: string) {
    const docs = await helpers.listDocuments(actor, contractId);
    const chosen = docs.find((row) => row.status === "COMPLETED" && row.hasFile);
    if (!chosen) return null;
    const file = await helpers.getDocumentFile(actor, chosen.id);
    const text = extractPlainText(file.bytes, file.contentType);
    return { ...chosen, text, byteSize: file.byteSize };
  }

  async function approvedPlaybook(organizationId: string, templateId?: string) {
    const conditions: SQL[] = [
      eq(clauseTemplate.organizationId, organizationId),
      eq(clauseTemplate.status, "APPROVED"),
      eq(clauseVersion.organizationId, organizationId),
      eq(clauseVersion.status, "APPROVED"),
    ];
    if (templateId) conditions.push(eq(clauseTemplate.id, templateId));
    const rows = await db
      .select({ template: clauseTemplate, version: clauseVersion })
      .from(clauseTemplate)
      .innerJoin(
        clauseVersion,
        and(
          eq(clauseVersion.id, clauseTemplate.currentVersionId),
          eq(clauseVersion.organizationId, organizationId),
        ),
      )
      .where(and(...conditions))
      .orderBy(clauseTemplate.title)
      .limit(8);
    return rows;
  }

  async function handleAsk(
    actor: Actor,
    organizationId: string,
    question: string,
    contractId: string | undefined,
    logs: ToolLog[],
  ): Promise<AssistantTurn> {
    if (!contractId) return ambiguousTurn();
    const row = await runTool(
      logs,
      "GET_CONTRACT",
      { contractId },
      () => helpers.scopedContract(organizationId, contractId),
      (value) => ({ ok: true, status: value.status }),
    );
    const sources: AssistantSource[] = [
      { kind: "CONTRACT_RECORD", id: row.id, text: recordSnapshot(row) },
    ];
    const recordCitations = storedFacts(question, row).map((fact) =>
      citation({
        sourceKind: "CONTRACT_RECORD",
        contractId: row.id,
        quote: fact.quote,
        href: `/contracts/${row.id}`,
      }),
    );
    const recordLines = storedFacts(question, row).map((fact) => fact.line);
    const doc = await runTool(
      logs,
      "GET_DOCUMENT",
      { contractId },
      () => pickAuthorizedDocument(actor, row.id),
      (value) => ({
        ok: true,
        documentId: value?.id ?? null,
        hasText: Boolean(value?.text),
      }),
    );
    const toolsUsed = logs.map((item) => item.toolName);
    if (doc?.text) {
      sources.push({ kind: "DOCUMENT", id: doc.id, text: doc.text });
      if (llm.status().available) {
        const payload = await llm.answer({ text: doc.text, question });
        if (payload.supported && payload.answer) {
          const turn = groundAssistantTurn(
            {
              intent: "ASK_CONTRACT",
              answer: payload.answer,
              supported: true,
              insufficientEvidence: false,
              disclaimer: null,
              followUp: null,
              proposal: null,
              toolsUsed,
              citations: payload.citations.map((item) =>
                citation({
                  sourceKind: "DOCUMENT",
                  documentId: doc.id,
                  contractId: row.id,
                  quote: item.quote,
                  page: item.page,
                  href: `/contracts/${row.id}`,
                }),
              ),
            },
            sources,
          );
          if (turn.supported) {
            if (recordLines.length) {
              return groundAssistantTurn(
                {
                  ...turn,
                  answer: `${turn.answer}\n\nFrom the contract record:\n${recordLines.join("\n")}`,
                  citations: [...turn.citations, ...recordCitations],
                },
                sources,
              );
            }
            return turn;
          }
        }
        if (!payload.supported && recordLines.length === 0) {
          return insufficientTurn(
            "ASK_CONTRACT",
            payload.refusalReason ??
              "Evidence is insufficient in the authorized documents for this question.",
            { toolsUsed },
          );
        }
      }
    }
    if (recordLines.length) {
      return groundAssistantTurn(
        {
          intent: "ASK_CONTRACT",
          answer: `From the contract record:\n${recordLines.join("\n")}`,
          supported: true,
          insufficientEvidence: false,
          disclaimer: null,
          followUp: null,
          citations: recordCitations,
          proposal: null,
          toolsUsed,
        },
        sources,
      );
    }
    if (doc && !llm.status().available) {
      return insufficientTurn(
        "ASK_CONTRACT",
        "AI is not connected, and the contract record does not contain a stored answer for this question.",
        { toolsUsed },
      );
    }
    return insufficientTurn(
      "ASK_CONTRACT",
      "Evidence is insufficient in the authorized documents and contract record.",
      { toolsUsed },
    );
  }

  async function handleSearch(
    organizationId: string,
    message: string,
    logs: ToolLog[],
  ): Promise<AssistantTurn> {
    const q = searchQueryFromMessage(message);
    const conditions: SQL[] = [eq(contract.organizationId, organizationId)];
    if (q) {
      const pattern = likeContains(q);
      const match = or(like(contract.title, pattern), like(vendor.name, pattern));
      if (match) conditions.push(match);
    }
    const where = and(...conditions);
    const rows = await runTool(
      logs,
      "SEARCH_CONTRACTS",
      { q: q ?? null },
      () =>
        db
          .select({ contract, vendorName: vendor.name })
          .from(contract)
          .leftJoin(
            vendor,
            and(eq(contract.vendorId, vendor.id), eq(vendor.organizationId, organizationId)),
          )
          .where(where)
          .orderBy(desc(contract.updatedAt))
          .limit(20),
      (value) => ({ ok: true, hitCount: value.length }),
    );
    if (rows.length === 0) {
      return {
        intent: "SEARCH_CONTRACTS",
        answer: q
          ? `No authorized contracts matched “${q}”.`
          : "No authorized contracts were found in this organization.",
        supported: true,
        insufficientEvidence: false,
        disclaimer: null,
        followUp: null,
        citations: [],
        proposal: null,
        toolsUsed: ["SEARCH_CONTRACTS"],
      };
    }
    const lines = rows.map((row) => {
      const vendorName = row.vendorName ? ` · ${row.vendorName}` : "";
      return `- ${row.contract.title}${vendorName} (${row.contract.status})`;
    });
    const sources: AssistantSource[] = rows.map((row) => ({
      kind: "CONTRACT_RECORD",
      id: row.contract.id,
      text: recordSnapshot(row.contract),
    }));
    return groundAssistantTurn(
      {
        intent: "SEARCH_CONTRACTS",
        answer: `Authorized contracts in this organization:\n${lines.join("\n")}`,
        supported: true,
        insufficientEvidence: false,
        disclaimer: null,
        followUp: null,
        proposal: null,
        toolsUsed: ["SEARCH_CONTRACTS"],
        citations: rows.map((row) =>
          citation({
            sourceKind: "CONTRACT_RECORD",
            contractId: row.contract.id,
            quote: row.contract.title,
            href: `/contracts/${row.contract.id}`,
          }),
        ),
      },
      sources,
    );
  }

  async function handleCompare(
    actor: Actor,
    organizationId: string,
    _message: string,
    leftId: string | undefined,
    rightId: string | undefined,
    logs: ToolLog[],
  ): Promise<AssistantTurn> {
    if (!leftId || !rightId || leftId === rightId) {
      return insufficientTurn(
        "COMPARE_TERMS",
        "Select two different authorized contracts to compare stored terms.",
        { followUp: "Use the left and right agreement pickers." },
      );
    }
    const left = await runTool(
      logs,
      "GET_CONTRACT",
      { contractId: leftId },
      () => helpers.scopedContract(organizationId, leftId),
      (value) => ({ ok: true, status: value.status }),
    );
    const right = await runTool(
      logs,
      "GET_CONTRACT",
      { contractId: rightId },
      () => helpers.scopedContract(organizationId, rightId),
      (value) => ({ ok: true, status: value.status }),
    );
    const pairs: [string, string | null, string | null][] = [
      ["Title", left.title, right.title],
      ["Status", left.status, right.status],
      ["Effective on", left.effectiveOn, right.effectiveOn],
      ["Expires on", left.expiresOn, right.expiresOn],
      [
        "Contract-stated value",
        left.valueMinor != null && left.currency
          ? formatMinorAmount(left.valueMinor, left.currency)
          : null,
        right.valueMinor != null && right.currency
          ? formatMinorAmount(right.valueMinor, right.currency)
          : null,
      ],
      ["Auto-renew", left.autoRenew ? "yes" : "no", right.autoRenew ? "yes" : "no"],
      [
        "Notice days",
        left.noticeDays != null ? String(left.noticeDays) : null,
        right.noticeDays != null ? String(right.noticeDays) : null,
      ],
    ];
    const diffs = pairs.filter(([, a, b]) => a !== b);
    const recordLines =
      diffs.length === 0
        ? ["Stored records match on title, status, dates, stated value, auto-renew, and notice."]
        : diffs.map(([label, a, b]) => `${label}: ${a ?? "—"} → ${b ?? "—"}`);
    const sources: AssistantSource[] = [
      { kind: "CONTRACT_RECORD", id: left.id, text: recordSnapshot(left) },
      { kind: "CONTRACT_RECORD", id: right.id, text: recordSnapshot(right) },
    ];
    const citations = [
      citation({
        sourceKind: "CONTRACT_RECORD",
        contractId: left.id,
        quote: left.title,
        href: `/contracts/${left.id}`,
      }),
      citation({
        sourceKind: "CONTRACT_RECORD",
        contractId: right.id,
        quote: right.title,
        href: `/contracts/${right.id}`,
      }),
    ];
    let answer = `Stored-term comparison of “${left.title}” and “${right.title}”:\n${recordLines.join("\n")}`;
    const toolsUsed = ["GET_CONTRACT", "COMPARE_RECORDS"];
    logs.push({
      toolName: "COMPARE_RECORDS",
      input: { leftContractId: left.id, rightContractId: right.id },
      result: { ok: true, differenceCount: diffs.length },
      durationMs: 0,
    });
    if (llm.status().available) {
      const leftDoc = await pickAuthorizedDocument(actor, left.id);
      const rightDoc = await pickAuthorizedDocument(actor, right.id);
      if (leftDoc?.text && rightDoc?.text) {
        await runTool(
          logs,
          "GET_DOCUMENT",
          { contractId: left.id, documentId: leftDoc.id },
          async () => leftDoc,
          (value) => ({ ok: true, documentId: value.id }),
        );
        await runTool(
          logs,
          "GET_DOCUMENT",
          { contractId: right.id, documentId: rightDoc.id },
          async () => rightDoc,
          (value) => ({ ok: true, documentId: value.id }),
        );
        const compared = await llm.compare({
          leftText: leftDoc.text,
          rightText: rightDoc.text,
          leftName: leftDoc.fileName,
          rightName: rightDoc.fileName,
        });
        sources.push(
          { kind: "DOCUMENT", id: leftDoc.id, text: leftDoc.text },
          { kind: "DOCUMENT", id: rightDoc.id, text: rightDoc.text },
        );
        toolsUsed.push("COMPARE_DOCUMENTS");
        logs.push({
          toolName: "COMPARE_DOCUMENTS",
          input: { leftDocumentId: leftDoc.id, rightDocumentId: rightDoc.id },
          result: { ok: true, changeCount: compared.changes.length },
          durationMs: 0,
        });
        if (compared.summary) {
          answer = `${answer}\n\nFrom authorized documents:\n${compared.summary}`;
        }
        for (const change of compared.changes) {
          if (change.citationA) {
            citations.push(
              citation({
                sourceKind: "DOCUMENT",
                documentId: leftDoc.id,
                contractId: left.id,
                quote: change.citationA.quote,
                page: change.citationA.page,
                href: `/contracts/${left.id}`,
              }),
            );
          }
          if (change.citationB) {
            citations.push(
              citation({
                sourceKind: "DOCUMENT",
                documentId: rightDoc.id,
                contractId: right.id,
                quote: change.citationB.quote,
                page: change.citationB.page,
                href: `/contracts/${right.id}`,
              }),
            );
          }
        }
      }
    }
    return groundAssistantTurn(
      {
        intent: "COMPARE_TERMS",
        answer,
        supported: true,
        insufficientEvidence: false,
        disclaimer: null,
        followUp: null,
        citations,
        proposal: null,
        toolsUsed,
      },
      sources,
    );
  }

  async function handleUpcoming(organizationId: string, logs: ToolLog[]): Promise<AssistantTurn> {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    });
    if (!org) notFound();
    const timezone = resolveTimeZone(org.timezone);
    const today = calendarDate(clock(), timezone);
    const horizon = addIsoDays(today, UPCOMING_HORIZON_DAYS) ?? today;
    const obligationRows = await runTool(
      logs,
      "LIST_OBLIGATIONS",
      { from: today, to: horizon },
      () =>
        db
          .select({ obligation, contractTitle: contract.title })
          .from(obligation)
          .innerJoin(
            contract,
            and(
              eq(obligation.contractId, contract.id),
              eq(contract.organizationId, organizationId),
            ),
          )
          .where(
            and(
              eq(obligation.organizationId, organizationId),
              inArray(obligation.status, [...OPEN_OBLIGATION]),
              or(
                eq(obligation.status, "OVERDUE"),
                and(gte(obligation.dueOn, today), lte(obligation.dueOn, horizon)),
              ),
            ),
          )
          .orderBy(obligation.dueOn)
          .limit(20),
      (value) => ({ ok: true, hitCount: value.length }),
    );
    const watches = await runTool(
      logs,
      "LIST_RENEWALS",
      { from: today, to: horizon },
      () =>
        db
          .select({ watch: renewalWatch, contractTitle: contract.title })
          .from(renewalWatch)
          .innerJoin(
            contract,
            and(
              eq(renewalWatch.contractId, contract.id),
              eq(contract.organizationId, organizationId),
            ),
          )
          .where(
            and(
              eq(renewalWatch.organizationId, organizationId),
              inArray(renewalWatch.status, [...WATCH_STATUSES]),
              or(lte(renewalWatch.noticeOn, horizon), lte(renewalWatch.expiresOn, horizon)),
            ),
          )
          .orderBy(renewalWatch.noticeOn)
          .limit(20),
      (value) => ({ ok: true, hitCount: value.length }),
    );
    const expiring = await db
      .select()
      .from(contract)
      .where(
        and(
          eq(contract.organizationId, organizationId),
          gte(contract.expiresOn, today),
          lte(contract.expiresOn, horizon),
        ),
      )
      .orderBy(contract.expiresOn)
      .limit(20);
    const lines: string[] = [];
    const citations: AssistantCitation[] = [];
    const sources: AssistantSource[] = [];
    for (const row of obligationRows) {
      lines.push(
        `- Obligation “${row.obligation.title}” on ${row.contractTitle} due ${row.obligation.dueOn ?? "unscheduled"} (${row.obligation.status}).`,
      );
      sources.push({
        kind: "OBLIGATION",
        id: row.obligation.id,
        text: `${row.obligation.title}\n${row.obligation.dueOn ?? ""}`,
      });
      citations.push(
        citation({
          sourceKind: "OBLIGATION",
          obligationId: row.obligation.id,
          contractId: row.obligation.contractId,
          quote: row.obligation.title,
          href: `/contracts/${row.obligation.contractId}`,
        }),
      );
    }
    for (const row of watches) {
      lines.push(
        `- Renewal watch on “${row.contractTitle}”: notice ${row.watch.noticeOn}, expires ${row.watch.expiresOn} (${row.watch.status}).`,
      );
      sources.push({
        kind: "CONTRACT_RECORD",
        id: row.watch.contractId,
        text: `${row.contractTitle}\n${row.watch.expiresOn}\n${row.watch.noticeOn}`,
      });
      citations.push(
        citation({
          sourceKind: "CONTRACT_RECORD",
          contractId: row.watch.contractId,
          quote: row.contractTitle,
          href: `/contracts/${row.watch.contractId}`,
        }),
      );
    }
    for (const row of expiring) {
      if (watches.some((item) => item.watch.contractId === row.id)) continue;
      lines.push(`- Stored expiry for “${row.title}”: ${row.expiresOn}.`);
      sources.push({ kind: "CONTRACT_RECORD", id: row.id, text: recordSnapshot(row) });
      citations.push(
        citation({
          sourceKind: "CONTRACT_RECORD",
          contractId: row.id,
          quote: row.expiresOn,
          href: `/contracts/${row.id}`,
        }),
      );
    }
    if (lines.length === 0) {
      return {
        intent: "UPCOMING_COMMITMENTS",
        answer: `No upcoming obligations or renewals were found in the next ${UPCOMING_HORIZON_DAYS} days for this organization (${today} to ${horizon}, ${timezone}).`,
        supported: true,
        insufficientEvidence: false,
        disclaimer: null,
        followUp: null,
        citations: [],
        proposal: null,
        toolsUsed: ["LIST_OBLIGATIONS", "LIST_RENEWALS"],
      };
    }
    return groundAssistantTurn(
      {
        intent: "UPCOMING_COMMITMENTS",
        answer: `Upcoming obligations and renewals (${today} to ${horizon}, ${timezone}):\n${lines.join("\n")}`,
        supported: true,
        insufficientEvidence: false,
        disclaimer: null,
        followUp: null,
        citations,
        proposal: null,
        toolsUsed: ["LIST_OBLIGATIONS", "LIST_RENEWALS"],
      },
      sources,
    );
  }

  async function handleDraft(
    organizationId: string,
    templateId: string | undefined,
    logs: ToolLog[],
  ): Promise<AssistantTurn> {
    const rows = await runTool(
      logs,
      "LIST_PLAYBOOK",
      { templateId: templateId ?? null, status: "APPROVED" },
      () => approvedPlaybook(organizationId, templateId),
      (value) => ({ ok: true, hitCount: value.length }),
    );
    if (rows.length === 0) {
      return insufficientTurn(
        "DRAFT_FROM_TEMPLATE",
        templateId
          ? "That template is not an approved playbook clause in this organization."
          : "No approved playbook templates are available to draft from.",
        { toolsUsed: ["LIST_PLAYBOOK"] },
      );
    }
    const sections = rows.map((row) => `## ${row.template.title}\n${row.version.body}`);
    const body = `# First draft (not legally validated)\n\n${sections.join("\n\n")}\n`;
    const title =
      rows.length === 1 ? `Draft: ${rows[0]!.template.title}` : "Draft from approved playbook";
    const sources: AssistantSource[] = rows.map((row) => ({
      kind: "CLAUSE_PLAYBOOK",
      id: row.template.id,
      text: row.version.body,
    }));
    return groundAssistantTurn(
      {
        intent: "DRAFT_FROM_TEMPLATE",
        answer:
          "A first draft was assembled from approved playbook language. Confirming it will create a DRAFT contract record. Generated language is not legally validated.",
        supported: true,
        insufficientEvidence: false,
        disclaimer: ASSISTANT_DISCLAIMERS.legalDraft,
        followUp:
          "Confirm only if you have contracts:write. Viewers can research but cannot create the draft.",
        citations: rows.map((row) =>
          citation({
            sourceKind: "CLAUSE_PLAYBOOK",
            clauseTemplateId: row.template.id,
            quote: row.version.body.slice(0, 180),
            href: `/clauses/${row.template.id}`,
          }),
        ),
        proposal: {
          kind: "DRAFT_CONTRACT",
          title,
          body,
          templateIds: rows.map((row) => row.template.id),
        },
        toolsUsed: ["LIST_PLAYBOOK"],
      },
      sources,
    );
  }

  async function handlePolicy(
    organizationId: string,
    contractId: string | undefined,
    logs: ToolLog[],
  ): Promise<AssistantTurn> {
    if (!contractId) return ambiguousTurn();
    const row = await helpers.scopedContract(organizationId, contractId);
    const playbook = await runTool(
      logs,
      "LIST_PLAYBOOK",
      { contractId, status: "APPROVED" },
      () => approvedPlaybook(organizationId),
      (value) => ({ ok: true, hitCount: value.length }),
    );
    const usages = await db
      .select({ usage: clauseUsage, template: clauseTemplate })
      .from(clauseUsage)
      .innerJoin(
        clauseTemplate,
        and(
          eq(clauseUsage.templateId, clauseTemplate.id),
          eq(clauseTemplate.organizationId, organizationId),
        ),
      )
      .where(
        and(eq(clauseUsage.organizationId, organizationId), eq(clauseUsage.contractId, contractId)),
      );
    const sources: AssistantSource[] = playbook.map((item) => ({
      kind: "CLAUSE_PLAYBOOK",
      id: item.template.id,
      text: item.version.body,
    }));
    sources.push({ kind: "CONTRACT_RECORD", id: row.id, text: recordSnapshot(row) });
    if (usages.length === 0) {
      return insufficientTurn(
        "EXPLAIN_POLICY",
        "No recorded playbook usage exists on this contract, so there is insufficient evidence of a policy exception.",
        { toolsUsed: ["LIST_PLAYBOOK", "GET_CONTRACT"] },
      );
    }
    const lines = usages.map((item) => {
      const approved = playbook.find((row) => row.template.id === item.template.id);
      return approved
        ? `Recorded usage of “${item.template.title}” matches an approved playbook clause (${item.template.status}).`
        : `Recorded usage of “${item.template.title}” is not currently an approved playbook clause.`;
    });
    const alternatives = await db
      .select()
      .from(clauseAlternative)
      .where(eq(clauseAlternative.organizationId, organizationId));
    if (alternatives.length) {
      lines.push(
        "Approved alternatives exist in the playbook. Using an approved alternative is not automatically a policy exception.",
      );
    }
    return groundAssistantTurn(
      {
        intent: "EXPLAIN_POLICY",
        answer: `${lines.join("\n")}\nThis is not a legal opinion.`,
        supported: true,
        insufficientEvidence: false,
        disclaimer: ASSISTANT_DISCLAIMERS.policy,
        followUp: null,
        proposal: null,
        toolsUsed: ["LIST_PLAYBOOK", "GET_CONTRACT"],
        citations: usages.flatMap((item) => {
          const approved = playbook.find((row) => row.template.id === item.template.id);
          if (!approved) return [];
          return [
            citation({
              sourceKind: "CLAUSE_PLAYBOOK",
              clauseTemplateId: item.template.id,
              contractId: row.id,
              quote: approved.version.body.slice(0, 180),
              href: `/clauses/${item.template.id}`,
            }),
          ];
        }),
      },
      sources,
    );
  }

  async function handleNegotiation(
    organizationId: string,
    logs: ToolLog[],
  ): Promise<AssistantTurn> {
    const playbook = await runTool(
      logs,
      "LIST_PLAYBOOK",
      { alternatives: true },
      () => approvedPlaybook(organizationId),
      (value) => ({ ok: true, hitCount: value.length }),
    );
    const alternatives = await db
      .select()
      .from(clauseAlternative)
      .where(eq(clauseAlternative.organizationId, organizationId));
    const alt = playbook.filter((row) =>
      alternatives.some((item) => item.alternativeTemplateId === row.template.id),
    );
    const chosen = alt[0] ?? playbook.find((row) => /narrow|alternative/i.test(row.template.title));
    if (!chosen) {
      return insufficientTurn(
        "NEGOTIATION_LANGUAGE",
        "No approved alternative playbook language is available to suggest.",
        { toolsUsed: ["LIST_PLAYBOOK"] },
      );
    }
    const sources: AssistantSource[] = [
      { kind: "CLAUSE_PLAYBOOK", id: chosen.template.id, text: chosen.version.body },
    ];
    return groundAssistantTurn(
      {
        intent: "NEGOTIATION_LANGUAGE",
        answer: `Approved alternative: “${chosen.template.title}”.\n\n${chosen.version.body}`,
        supported: true,
        insufficientEvidence: false,
        disclaimer: ASSISTANT_DISCLAIMERS.negotiation,
        followUp: null,
        proposal: null,
        toolsUsed: ["LIST_PLAYBOOK"],
        citations: [
          citation({
            sourceKind: "CLAUSE_PLAYBOOK",
            clauseTemplateId: chosen.template.id,
            quote: chosen.version.body.slice(0, 180),
            href: `/clauses/${chosen.template.id}`,
          }),
        ],
      },
      sources,
    );
  }

  async function dispatch(
    actor: Actor,
    organizationId: string,
    input: {
      message: string;
      contractId?: string;
      leftContractId?: string;
      rightContractId?: string;
      templateId?: string;
    },
    logs: ToolLog[],
  ): Promise<AssistantTurn> {
    const intent = classifyIntent(input);
    if (intent === "INJECTION") {
      logs.push({
        toolName: "PERMISSION_GUARD",
        input: { blocked: true },
        result: { ok: true, blocked: true },
        durationMs: 0,
      });
      return refuseInjectionTurn();
    }
    if (intent === "UNSUPPORTED") return unsupportedTurn();
    if (intent === "AMBIGUOUS") return ambiguousTurn();
    if (intent === "SEARCH_CONTRACTS") return handleSearch(organizationId, input.message, logs);
    if (intent === "UPCOMING_COMMITMENTS") return handleUpcoming(organizationId, logs);
    if (intent === "DRAFT_FROM_TEMPLATE") {
      return handleDraft(organizationId, input.templateId, logs);
    }
    if (intent === "EXPLAIN_POLICY") {
      return handlePolicy(organizationId, input.contractId, logs);
    }
    if (intent === "NEGOTIATION_LANGUAGE") return handleNegotiation(organizationId, logs);
    if (intent === "COMPARE_TERMS" || intent === "SUMMARIZE_CHANGES") {
      const compared = await handleCompare(
        actor,
        organizationId,
        input.message,
        input.leftContractId,
        input.rightContractId,
        logs,
      );
      return { ...compared, intent };
    }
    return handleAsk(actor, organizationId, input.message, input.contractId, logs);
  }

  return {
    async listAssistantThreads(actor: Actor) {
      const organizationId = requirePermission(actor, "contracts:read");
      const rows = await db
        .select()
        .from(assistantThread)
        .where(
          and(
            eq(assistantThread.organizationId, organizationId),
            eq(assistantThread.createdByUserId, actor.userId),
          ),
        )
        .orderBy(desc(assistantThread.updatedAt))
        .limit(50);
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      }));
    },

    async getAssistantThread(actor: Actor, threadId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      return loadThreadBundle(organizationId, actor.userId, threadId);
    },

    async sendAssistantMessage(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:read");
      const input = parseInput(sendAssistantMessageSchema, raw);
      const now = clock();
      let thread = input.threadId
        ? await scopedThread(organizationId, actor.userId, input.threadId)
        : null;
      if (!thread) {
        const created = {
          id: id(),
          organizationId,
          createdByUserId: actor.userId,
          title: threadTitle(input.message),
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(assistantThread).values(created);
        thread = created;
      }
      const userMessageId = id();
      await db.insert(assistantMessage).values({
        id: userMessageId,
        organizationId,
        threadId: thread.id,
        role: "USER",
        content: input.message,
        intent: null,
        status: "COMPLETED",
        insufficientEvidence: false,
        disclaimer: null,
        createdAt: now,
      });
      const logs: ToolLog[] = [];
      let turn: AssistantTurn;
      try {
        turn = await dispatch(actor, organizationId, input, logs);
      } catch (error) {
        if (
          isAppError(error) &&
          (error.code === "NOT_FOUND" ||
            error.code === "FORBIDDEN" ||
            error.code === "UNAUTHENTICATED")
        ) {
          throw error;
        }
        turn = insufficientTurn(
          classifyIntent(input),
          isAppError(error) ? error.message : "The assistant could not complete this turn.",
          { toolsUsed: logs.map((item) => item.toolName) },
        );
      }
      const assistantMessageId = id();
      const status = messageStatus(turn);
      await db.insert(assistantMessage).values({
        id: assistantMessageId,
        organizationId,
        threadId: thread.id,
        role: "ASSISTANT",
        content: turn.answer ?? "Evidence is insufficient.",
        intent: turn.intent,
        status,
        insufficientEvidence: turn.insufficientEvidence,
        disclaimer: turn.disclaimer,
        createdAt: clock(),
      });
      if (turn.citations.length) {
        await db.insert(assistantCitation).values(
          turn.citations.map((item) => ({
            id: id(),
            organizationId,
            messageId: assistantMessageId,
            sourceKind: item.sourceKind,
            quote: item.quote,
            page: item.page,
            contractId: item.contractId,
            documentId: item.documentId,
            clauseTemplateId: item.clauseTemplateId,
            obligationId: item.obligationId,
            href: item.href,
          })),
        );
      }
      if (turn.proposal) {
        await db.insert(assistantProposal).values({
          id: id(),
          organizationId,
          threadId: thread.id,
          messageId: assistantMessageId,
          kind: turn.proposal.kind,
          status: "PENDING_CONFIRMATION",
          title: turn.proposal.title,
          body: turn.proposal.body,
          templateIdsJson: JSON.stringify(turn.proposal.templateIds),
          createdContractId: null,
          createdByUserId: actor.userId,
          confirmedByUserId: null,
          createdAt: clock(),
          decidedAt: null,
        });
        await writeAudit(db, actor, "assistant.proposal", "assistant_thread", thread.id, {
          intent: turn.intent,
        });
      }
      if (logs.length) {
        await db.insert(assistantToolCall).values(
          logs.map((item) => ({
            id: id(),
            organizationId,
            threadId: thread.id,
            messageId: assistantMessageId,
            toolName: item.toolName,
            inputJson: JSON.stringify(item.input),
            resultJson: JSON.stringify(item.result),
            durationMs: item.durationMs,
            createdAt: clock(),
          })),
        );
      }
      await db
        .update(assistantThread)
        .set({ updatedAt: clock() })
        .where(eq(assistantThread.id, thread.id));
      await writeAudit(db, actor, "assistant.send", "assistant_thread", thread.id, {
        intent: turn.intent,
        status,
        insufficientEvidence: turn.insufficientEvidence,
      });
      logAssistant({
        intent: turn.intent,
        status,
        threadId: thread.id,
        hitCount: turn.citations.length,
        provider: llm.status().provider,
      });
      return loadThreadBundle(organizationId, actor.userId, thread.id);
    },

    async confirmAssistantProposal(actor: Actor, proposalId: string) {
      const organizationId = requirePermission(actor, "contracts:write");
      const proposal = await scopedProposal(organizationId, proposalId);
      if (proposal.status !== "PENDING_CONFIRMATION") {
        throw new AppError("CONFLICT", "This proposal is no longer waiting for confirmation.");
      }
      const templateIds = parseTemplateIds(proposal.templateIdsJson);
      const playbook = await approvedPlaybook(organizationId);
      const approvedIds = new Set(playbook.map((row) => row.template.id));
      if (templateIds.some((item) => !approvedIds.has(item))) {
        throw new AppError(
          "VALIDATION",
          "One or more templates are no longer approved in this organization.",
        );
      }
      const contractId = id();
      const versionId = id();
      const now = clock();
      const summary = "Draft assembled from approved playbook language. Not legally validated.";
      await db.transaction(async (tx) => {
        await tx.insert(contract).values({
          id: contractId,
          organizationId,
          title: proposal.title,
          status: "DRAFT",
          vendorId: null,
          ownerUserId: actor.userId,
          currentVersionId: versionId,
          effectiveOn: null,
          expiresOn: null,
          category: "OTHER",
          currency: null,
          valueMinor: null,
          department: null,
          noticeDays: null,
          autoRenew: false,
          createdByUserId: actor.userId,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(contractVersion).values({
          id: versionId,
          organizationId,
          contractId,
          versionNumber: 1,
          status: "DRAFT",
          summary,
          createdByUserId: actor.userId,
          createdAt: now,
        });
        await tx
          .update(assistantProposal)
          .set({
            status: "CONFIRMED",
            createdContractId: contractId,
            confirmedByUserId: actor.userId,
            decidedAt: now,
          })
          .where(eq(assistantProposal.id, proposal.id));
        await writeAudit(tx, actor, "assistant.confirm", "assistant_proposal", proposal.id, {
          contractId,
        });
        await writeAudit(tx, actor, "contract.create", "contract", contractId, {
          title: proposal.title,
          source: "assistant",
        });
      });
      if (can(actor, "clauses:manage")) {
        for (const templateId of templateIds) {
          const template = playbook.find((row) => row.template.id === templateId);
          if (!template?.template.currentVersionId) continue;
          try {
            await db.insert(clauseUsage).values({
              id: id(),
              organizationId,
              templateId,
              versionId: template.template.currentVersionId,
              contractId,
              createdByUserId: actor.userId,
              createdAt: now,
            });
          } catch (error) {
            if (!isUniqueFailure(error)) throw error;
          }
        }
      }
      logAssistant({
        intent: "DRAFT_FROM_TEMPLATE",
        tool: "CONFIRM_PROPOSAL",
        status: "CONFIRMED",
        threadId: proposal.threadId,
      });
      return {
        proposal: {
          ...toProposalView({ ...proposal, status: "CONFIRMED", createdContractId: contractId }),
        },
        contractId,
      };
    },

    async rejectAssistantProposal(actor: Actor, proposalId: string) {
      const organizationId = requirePermission(actor, "contracts:write");
      const proposal = await scopedProposal(organizationId, proposalId);
      if (proposal.status !== "PENDING_CONFIRMATION") {
        throw new AppError("CONFLICT", "This proposal is no longer waiting for confirmation.");
      }
      const now = clock();
      await db
        .update(assistantProposal)
        .set({
          status: "REJECTED",
          confirmedByUserId: actor.userId,
          decidedAt: now,
        })
        .where(eq(assistantProposal.id, proposal.id));
      await writeAudit(db, actor, "assistant.reject", "assistant_proposal", proposal.id, {
        threadId: proposal.threadId,
      });
      return { proposal: toProposalView({ ...proposal, status: "REJECTED" }) };
    },
  };
}
