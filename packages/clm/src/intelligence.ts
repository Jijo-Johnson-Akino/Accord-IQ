import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  aiLogFields,
  createNoneAdapter,
  extractPlainText,
  type LlmAdapter,
  type LlmStatus,
} from "@accordiq/ai";
import { AppError, isAppError, parseInput } from "@accordiq/core";
import type { Actor } from "@accordiq/auth";
import {
  comparisonChange,
  contract,
  contractParty,
  contractQuestion,
  extractedClause,
  extractedField,
  extractedObligation,
  extractedParty,
  extractionRun,
  obligation,
  questionCitation,
  versionComparison,
  type Database,
} from "@accordiq/db";
import { EXTRACTION_FIELD_KEYS, type ExtractionFieldKey } from "./enums";
import { id, notFound, requirePermission, writeAudit } from "./helpers";
import { moneyToMinor } from "./money";
import type { ClmOptions, PublicDocument } from "./repository";
import {
  applyExtractionSchema,
  askQuestionSchema,
  compareDocumentsSchema,
  correctExtractedFieldSchema,
  startExtractionSchema,
} from "./validation";

const FIELD_KEYS: readonly ExtractionFieldKey[] = EXTRACTION_FIELD_KEYS;

function now(): Date {
  return new Date();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function pct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function effectiveValue(row: typeof extractedField.$inferSelect): string | null {
  if (row.verification === "CORRECTED") return row.correctedValue;
  if (row.verification === "REJECTED") return null;
  return row.valueText;
}

function logAi(event: Parameters<typeof aiLogFields>[0]): void {
  console.info("[accordiq:ai]", JSON.stringify(aiLogFields(event)));
}

export function createIntelligenceAccess(
  db: Database,
  options: ClmOptions,
  helpers: {
    scopedContract: (
      organizationId: string,
      contractId: string,
    ) => Promise<typeof contract.$inferSelect>;
    getDocumentFile: (
      actor: Actor,
      documentId: string,
    ) => Promise<{ bytes: Uint8Array; contentType: string; fileName: string; byteSize: number }>;
    listDocuments: (actor: Actor, contractId: string) => Promise<PublicDocument[]>;
  },
) {
  const llm: LlmAdapter = options.llm ?? createNoneAdapter();

  async function scopedRun(organizationId: string, runId: string) {
    const row = await db.query.extractionRun.findFirst({
      where: and(eq(extractionRun.id, runId), eq(extractionRun.organizationId, organizationId)),
    });
    if (!row) notFound();
    return row;
  }

  async function pickDocument(
    actor: Actor,
    contractId: string,
    documentId?: string,
  ): Promise<PublicDocument> {
    const docs = await helpers.listDocuments(actor, contractId);
    const chosen = documentId
      ? docs.find((row) => row.id === documentId)
      : docs.find((row) => row.status === "COMPLETED" && row.hasFile);
    if (!chosen || !chosen.hasFile) {
      throw new AppError("VALIDATION", "Upload a processed PDF or DOCX before running analysis.");
    }
    return chosen;
  }

  async function loadSource(actor: Actor, documentId: string) {
    const file = await helpers.getDocumentFile(actor, documentId);
    const text = extractPlainText(file.bytes, file.contentType);
    return { file, text };
  }

  async function persistExtraction(
    organizationId: string,
    contractId: string,
    runId: string,
    payload: Awaited<ReturnType<LlmAdapter["extract"]>>,
  ) {
    const createdAt = now();
    const fieldValues: Record<
      ExtractionFieldKey,
      {
        value: string | null;
        confidence: number;
        citation: { quote: string; page: number | null } | null;
      }
    > = {
      TITLE: payload.title,
      START_DATE: payload.startDate,
      END_DATE: payload.endDate,
      RENEWAL_TERMS: payload.renewalTerms,
      GOVERNING_LAW: payload.governingLaw,
      JURISDICTION: payload.jurisdiction,
      VALUE: payload.contractValue,
      CURRENCY: payload.currency,
      PAYMENT_TERMS: payload.paymentTerms,
      SUMMARY: {
        value: payload.summary.text,
        confidence: payload.summary.confidence,
        citation: null,
      },
    };
    await db.insert(extractedField).values(
      FIELD_KEYS.map((fieldKey) => ({
        id: id(),
        organizationId,
        runId,
        contractId,
        fieldKey,
        valueText: fieldValues[fieldKey].value,
        confidence: pct(fieldValues[fieldKey].confidence),
        citationQuote: fieldValues[fieldKey].citation?.quote ?? null,
        citationPage: fieldValues[fieldKey].citation?.page ?? null,
        verification: "SUGGESTED" as const,
        correctedValue: null,
        correctedByUserId: null,
        correctedAt: null,
        createdAt,
      })),
    );
    if (payload.parties.length) {
      await db.insert(extractedParty).values(
        payload.parties.map((party) => ({
          id: id(),
          organizationId,
          runId,
          contractId,
          name: party.name,
          role: party.role,
          confidence: pct(party.confidence),
          citationQuote: party.citation?.quote ?? null,
          citationPage: party.citation?.page ?? null,
          verification: "SUGGESTED" as const,
          createdAt,
        })),
      );
    }
    if (payload.clauses.length) {
      await db.insert(extractedClause).values(
        payload.clauses.map((clause) => ({
          id: id(),
          organizationId,
          runId,
          contractId,
          heading: clause.heading,
          summary: clause.summary,
          confidence: pct(clause.confidence),
          citationQuote: clause.citation?.quote ?? null,
          citationPage: clause.citation?.page ?? null,
          verification: "SUGGESTED" as const,
          createdAt,
        })),
      );
    }
    if (payload.obligations.length) {
      await db.insert(extractedObligation).values(
        payload.obligations.map((row) => ({
          id: id(),
          organizationId,
          runId,
          contractId,
          title: row.title,
          dueOn: row.dueOn,
          confidence: pct(row.confidence),
          citationQuote: row.citation?.quote ?? null,
          citationPage: row.citation?.page ?? null,
          verification: "SUGGESTED" as const,
          promotedObligationId: null,
          createdAt,
        })),
      );
    }
  }

  async function loadRunBundle(organizationId: string, run: typeof extractionRun.$inferSelect) {
    const [fields, parties, clauses, obligations] = await Promise.all([
      db
        .select()
        .from(extractedField)
        .where(
          and(eq(extractedField.runId, run.id), eq(extractedField.organizationId, organizationId)),
        ),
      db
        .select()
        .from(extractedParty)
        .where(
          and(eq(extractedParty.runId, run.id), eq(extractedParty.organizationId, organizationId)),
        ),
      db
        .select()
        .from(extractedClause)
        .where(
          and(
            eq(extractedClause.runId, run.id),
            eq(extractedClause.organizationId, organizationId),
          ),
        ),
      db
        .select()
        .from(extractedObligation)
        .where(
          and(
            eq(extractedObligation.runId, run.id),
            eq(extractedObligation.organizationId, organizationId),
          ),
        ),
    ]);
    return { run, fields, parties, clauses, obligations };
  }

  async function loadQuestionBundle(organizationId: string, questionId: string) {
    const row = await db.query.contractQuestion.findFirst({
      where: and(
        eq(contractQuestion.id, questionId),
        eq(contractQuestion.organizationId, organizationId),
      ),
    });
    if (!row) notFound();
    const citations = await db
      .select()
      .from(questionCitation)
      .where(
        and(
          eq(questionCitation.questionId, questionId),
          eq(questionCitation.organizationId, organizationId),
        ),
      );
    return { ...row, citations };
  }

  async function loadComparisonBundle(organizationId: string, comparisonId: string) {
    const row = await db.query.versionComparison.findFirst({
      where: and(
        eq(versionComparison.id, comparisonId),
        eq(versionComparison.organizationId, organizationId),
      ),
    });
    if (!row) notFound();
    const changes = await db
      .select()
      .from(comparisonChange)
      .where(
        and(
          eq(comparisonChange.comparisonId, comparisonId),
          eq(comparisonChange.organizationId, organizationId),
        ),
      );
    return { ...row, changes };
  }

  return {
    getAiStatus(_actor: Actor): LlmStatus {
      requirePermission(_actor, "contracts:read");
      return llm.status();
    },

    async getContractIntelligence(actor: Actor, contractId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      await helpers.scopedContract(organizationId, contractId);
      const [runs, questions, comparisons] = await Promise.all([
        db
          .select()
          .from(extractionRun)
          .where(
            and(
              eq(extractionRun.contractId, contractId),
              eq(extractionRun.organizationId, organizationId),
            ),
          )
          .orderBy(desc(extractionRun.createdAt))
          .limit(10),
        db
          .select()
          .from(contractQuestion)
          .where(
            and(
              eq(contractQuestion.contractId, contractId),
              eq(contractQuestion.organizationId, organizationId),
            ),
          )
          .orderBy(desc(contractQuestion.createdAt))
          .limit(20),
        db
          .select()
          .from(versionComparison)
          .where(
            and(
              eq(versionComparison.contractId, contractId),
              eq(versionComparison.organizationId, organizationId),
            ),
          )
          .orderBy(desc(versionComparison.createdAt))
          .limit(10),
      ]);
      const latest = runs[0] ? await loadRunBundle(organizationId, runs[0]) : null;
      const questionIds = questions.map((row) => row.id);
      const citations =
        questionIds.length === 0
          ? []
          : await db
              .select()
              .from(questionCitation)
              .where(eq(questionCitation.organizationId, organizationId));
      const citationsByQuestion = new Map<string, typeof citations>();
      for (const citation of citations) {
        const list = citationsByQuestion.get(citation.questionId) ?? [];
        list.push(citation);
        citationsByQuestion.set(citation.questionId, list);
      }
      const comparisonIds = comparisons.map((row) => row.id);
      const changes =
        comparisonIds.length === 0
          ? []
          : await db
              .select()
              .from(comparisonChange)
              .where(eq(comparisonChange.organizationId, organizationId));
      return {
        status: llm.status(),
        runs,
        latest,
        questions: questions.map((row) => ({
          ...row,
          citations: (citationsByQuestion.get(row.id) ?? []).filter(
            (citation) => citation.questionId === row.id,
          ),
        })),
        comparisons: comparisons.map((row) => ({
          ...row,
          changes: changes.filter((change) => change.comparisonId === row.id),
        })),
      };
    },

    async startExtraction(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(startExtractionSchema, raw ?? {});
      await helpers.scopedContract(organizationId, contractId);
      const chosen = await pickDocument(actor, contractId, input.documentId);
      const startedAt = now();
      const runId = id();
      const status = llm.status();
      await db.insert(extractionRun).values({
        id: runId,
        organizationId,
        contractId,
        documentId: chosen.id,
        versionId: chosen.versionId,
        status: "QUEUED",
        provider: status.provider,
        model: status.model,
        error: null,
        conflictJson: null,
        sourceCharCount: 0,
        sourceSha256: null,
        createdByUserId: actor.userId,
        createdAt: startedAt,
        startedAt,
        finishedAt: null,
      });
      await writeAudit(db, actor, "extraction.start", "extraction_run", runId, {
        contractId,
        documentId: chosen.id,
        provider: status.provider,
      });

      if (!status.available) {
        const finishedAt = now();
        await db
          .update(extractionRun)
          .set({
            status: "UNAVAILABLE",
            error: "AI is not connected. Use the setup steps in AI Contract Studio.",
            finishedAt,
          })
          .where(
            and(eq(extractionRun.id, runId), eq(extractionRun.organizationId, organizationId)),
          );
        logAi({ provider: status.provider, model: status.model, status: "UNAVAILABLE" });
        return loadRunBundle(organizationId, await scopedRun(organizationId, runId));
      }

      await db
        .update(extractionRun)
        .set({ status: "RUNNING" })
        .where(and(eq(extractionRun.id, runId), eq(extractionRun.organizationId, organizationId)));

      try {
        const { file, text } = await loadSource(actor, chosen.id);
        if (!text) {
          throw new AppError(
            "VALIDATION",
            "No extractable text. Scanned or compressed documents are not supported yet.",
          );
        }
        const payload = await llm.extract({ text, fileName: file.fileName });
        await persistExtraction(organizationId, contractId, runId, payload);
        const finishedAt = now();
        await db
          .update(extractionRun)
          .set({
            status: "COMPLETED",
            error: null,
            conflictJson: payload.conflicts.length ? JSON.stringify(payload.conflicts) : null,
            sourceCharCount: text.length,
            sourceSha256: sha256(text),
            finishedAt,
          })
          .where(
            and(eq(extractionRun.id, runId), eq(extractionRun.organizationId, organizationId)),
          );
        logAi({
          provider: status.provider,
          model: status.model,
          status: "COMPLETED",
          sourceChars: text.length,
        });
        return loadRunBundle(organizationId, await scopedRun(organizationId, runId));
      } catch (error) {
        const message = isAppError(error) ? error.message : "Document analysis failed.";
        const finishedAt = now();
        await db
          .update(extractionRun)
          .set({ status: "FAILED", error: message, finishedAt })
          .where(
            and(eq(extractionRun.id, runId), eq(extractionRun.organizationId, organizationId)),
          );
        logAi({
          provider: status.provider,
          model: status.model,
          status: "FAILED",
          code: isAppError(error) ? error.code : "INTERNAL",
        });
        return loadRunBundle(organizationId, await scopedRun(organizationId, runId));
      }
    },

    async correctExtractedField(actor: Actor, runId: string, fieldId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(correctExtractedFieldSchema, raw);
      if (input.verification === "CORRECTED" && !input.correctedValue) {
        throw new AppError("VALIDATION", "Enter a corrected value.");
      }
      const run = await scopedRun(organizationId, runId);
      const field = await db.query.extractedField.findFirst({
        where: and(
          eq(extractedField.id, fieldId),
          eq(extractedField.runId, run.id),
          eq(extractedField.organizationId, organizationId),
        ),
      });
      if (!field) notFound();
      const correctedAt = now();
      await db
        .update(extractedField)
        .set({
          verification: input.verification,
          correctedValue: input.verification === "CORRECTED" ? input.correctedValue : null,
          correctedByUserId: actor.userId,
          correctedAt,
        })
        .where(
          and(eq(extractedField.id, fieldId), eq(extractedField.organizationId, organizationId)),
        );
      await writeAudit(db, actor, "extraction.correct", "extracted_field", fieldId, {
        verification: input.verification,
        fieldKey: field.fieldKey,
      });
      const updated = await db.query.extractedField.findFirst({
        where: and(
          eq(extractedField.id, fieldId),
          eq(extractedField.organizationId, organizationId),
        ),
      });
      if (!updated) notFound();
      return updated;
    },

    async applyExtraction(actor: Actor, runId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(applyExtractionSchema, raw ?? {});
      const run = await scopedRun(organizationId, runId);
      const bundle = await loadRunBundle(organizationId, run);
      const applicable = bundle.fields.filter(
        (row) => row.verification === "VERIFIED" || row.verification === "CORRECTED",
      );
      const patch: Partial<typeof contract.$inferInsert> = { updatedAt: now() };
      for (const field of applicable) {
        const value = effectiveValue(field);
        if (field.fieldKey === "TITLE" && value) patch.title = value;
        if (field.fieldKey === "START_DATE") patch.effectiveOn = value;
        if (field.fieldKey === "END_DATE") patch.expiresOn = value;
        if (field.fieldKey === "CURRENCY" && value) patch.currency = value;
      }
      for (const field of applicable) {
        const value = effectiveValue(field);
        if (field.fieldKey === "VALUE" && value) {
          try {
            patch.valueMinor = moneyToMinor({
              value,
              currency: typeof patch.currency === "string" ? patch.currency : undefined,
            });
          } catch {
            // Leave the stored contract value unchanged when the suggestion is not a decimal amount.
          }
        }
      }
      await db
        .update(contract)
        .set(patch)
        .where(and(eq(contract.id, run.contractId), eq(contract.organizationId, organizationId)));

      if (input.includeParties) {
        const existing = await db
          .select()
          .from(contractParty)
          .where(
            and(
              eq(contractParty.contractId, run.contractId),
              eq(contractParty.organizationId, organizationId),
            ),
          );
        const names = new Set(existing.map((row) => row.name.toLowerCase()));
        for (const party of bundle.parties) {
          if (names.has(party.name.toLowerCase())) continue;
          await db.insert(contractParty).values({
            id: id(),
            organizationId,
            contractId: run.contractId,
            vendorId: null,
            name: party.name,
            role: party.role,
            email: null,
            createdAt: now(),
          });
        }
      }

      if (input.includeObligations) {
        for (const row of bundle.obligations) {
          if (row.promotedObligationId) continue;
          if (row.verification === "REJECTED") continue;
          const obligationId = id();
          await db.insert(obligation).values({
            id: obligationId,
            organizationId,
            contractId: run.contractId,
            title: row.title,
            description: "Promoted from an AI suggestion. Verify against the source document.",
            dueOn: row.dueOn,
            status: "OPEN",
            ownerUserId: actor.userId,
            createdByUserId: actor.userId,
            createdAt: now(),
            updatedAt: now(),
          });
          await db
            .update(extractedObligation)
            .set({ promotedObligationId: obligationId, verification: "VERIFIED" })
            .where(
              and(
                eq(extractedObligation.id, row.id),
                eq(extractedObligation.organizationId, organizationId),
              ),
            );
        }
      }

      await writeAudit(db, actor, "extraction.apply", "extraction_run", runId, {
        contractId: run.contractId,
      });
      return helpers.scopedContract(organizationId, run.contractId);
    },

    async askQuestion(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:read");
      const input = parseInput(askQuestionSchema, raw);
      await helpers.scopedContract(organizationId, contractId);
      const chosen = await pickDocument(actor, contractId, input.documentId);
      const status = llm.status();
      const questionId = id();
      const createdAt = now();
      await db.insert(contractQuestion).values({
        id: questionId,
        organizationId,
        contractId,
        documentId: chosen.id,
        question: input.question,
        answer: null,
        supported: false,
        refusalReason: null,
        provider: status.provider,
        model: status.model,
        status: "RUNNING",
        error: null,
        createdByUserId: actor.userId,
        createdAt,
        finishedAt: null,
      });
      await writeAudit(db, actor, "extraction.question", "contract_question", questionId, {
        contractId,
      });
      if (!status.available) {
        await db
          .update(contractQuestion)
          .set({
            status: "UNAVAILABLE",
            refusalReason: "AI is not connected.",
            finishedAt: now(),
          })
          .where(eq(contractQuestion.id, questionId));
        return loadQuestionBundle(organizationId, questionId);
      }
      try {
        const { text } = await loadSource(actor, chosen.id);
        if (!text) {
          throw new AppError(
            "VALIDATION",
            "No extractable text. Scanned or compressed documents are not supported yet.",
          );
        }
        const payload = await llm.answer({ text, question: input.question });
        await db
          .update(contractQuestion)
          .set({
            status: "COMPLETED",
            answer: payload.answer,
            supported: payload.supported,
            refusalReason: payload.refusalReason,
            finishedAt: now(),
          })
          .where(eq(contractQuestion.id, questionId));
        if (payload.citations.length) {
          await db.insert(questionCitation).values(
            payload.citations.map((citation) => ({
              id: id(),
              organizationId,
              questionId,
              quote: citation.quote,
              page: citation.page,
            })),
          );
        }
        logAi({
          provider: status.provider,
          model: status.model,
          status: "COMPLETED",
          sourceChars: text.length,
        });
      } catch (error) {
        const message = isAppError(error) ? error.message : "The question could not be answered.";
        await db
          .update(contractQuestion)
          .set({ status: "FAILED", error: message, finishedAt: now() })
          .where(eq(contractQuestion.id, questionId));
        logAi({
          provider: status.provider,
          model: status.model,
          status: "FAILED",
          code: isAppError(error) ? error.code : "INTERNAL",
        });
      }
      return loadQuestionBundle(organizationId, questionId);
    },

    async compareDocuments(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(compareDocumentsSchema, raw);
      if (input.leftDocumentId === input.rightDocumentId) {
        throw new AppError("VALIDATION", "Choose two different documents to compare.");
      }
      await helpers.scopedContract(organizationId, contractId);
      await pickDocument(actor, contractId, input.leftDocumentId);
      await pickDocument(actor, contractId, input.rightDocumentId);
      const status = llm.status();
      const comparisonId = id();
      await db.insert(versionComparison).values({
        id: comparisonId,
        organizationId,
        contractId,
        leftDocumentId: input.leftDocumentId,
        rightDocumentId: input.rightDocumentId,
        summary: null,
        provider: status.provider,
        model: status.model,
        status: "RUNNING",
        error: null,
        createdByUserId: actor.userId,
        createdAt: now(),
        finishedAt: null,
      });
      await writeAudit(db, actor, "extraction.compare", "version_comparison", comparisonId, {
        contractId,
      });
      if (!status.available) {
        await db
          .update(versionComparison)
          .set({
            status: "UNAVAILABLE",
            error: "AI is not connected.",
            finishedAt: now(),
          })
          .where(eq(versionComparison.id, comparisonId));
        return loadComparisonBundle(organizationId, comparisonId);
      }
      try {
        const left = await loadSource(actor, input.leftDocumentId);
        const right = await loadSource(actor, input.rightDocumentId);
        if (!left.text || !right.text) {
          throw new AppError(
            "VALIDATION",
            "No extractable text. Scanned or compressed documents are not supported yet.",
          );
        }
        const payload = await llm.compare({
          leftText: left.text,
          rightText: right.text,
          leftName: left.file.fileName,
          rightName: right.file.fileName,
        });
        await db
          .update(versionComparison)
          .set({ status: "COMPLETED", summary: payload.summary, finishedAt: now() })
          .where(eq(versionComparison.id, comparisonId));
        if (payload.changes.length) {
          await db.insert(comparisonChange).values(
            payload.changes.map((change) => ({
              id: id(),
              organizationId,
              comparisonId,
              topic: change.topic,
              beforeText: change.before,
              afterText: change.after,
              citationA: change.citationA?.quote ?? null,
              citationB: change.citationB?.quote ?? null,
            })),
          );
        }
        logAi({ provider: status.provider, model: status.model, status: "COMPLETED" });
      } catch (error) {
        const message = isAppError(error) ? error.message : "The comparison failed.";
        await db
          .update(versionComparison)
          .set({ status: "FAILED", error: message, finishedAt: now() })
          .where(eq(versionComparison.id, comparisonId));
        logAi({
          provider: status.provider,
          model: status.model,
          status: "FAILED",
          code: isAppError(error) ? error.code : "INTERNAL",
        });
      }
      return loadComparisonBundle(organizationId, comparisonId);
    },
  };
}
