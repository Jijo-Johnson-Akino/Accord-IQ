"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  Textarea,
  useToast,
} from "@accordiq/ui";
import { Sparkles } from "lucide-react";
import { INTENT_LABELS, SUGGESTED_PROMPTS } from "./labels";

type AiStatus = {
  provider: string;
  available: boolean;
  synthetic: boolean;
  model: string | null;
  setup: string[];
};

type Citation = {
  id: string;
  sourceKind: string;
  quote: string | null;
  page: number | null;
  href: string | null;
};

type Proposal = {
  id: string;
  kind: string;
  status: string;
  title: string;
  body: string;
  templateIds: string[];
  createdContractId: string | null;
};

type Message = {
  id: string;
  role: string;
  content: string;
  intent: string | null;
  status: string;
  insufficientEvidence: boolean;
  disclaimer: string | null;
  createdAt: string;
  citations: Citation[];
  proposal: Proposal | null;
};

type Thread = { id: string; title: string; createdAt: string; updatedAt: string };

type Bundle = { thread: Thread; messages: Message[] };

export function StudioWorkspace({
  canWrite,
  status,
  threads,
  initialBundle,
  contracts,
  templates,
}: {
  canWrite: boolean;
  status: AiStatus;
  threads: Thread[];
  initialBundle: Bundle | null;
  contracts: { id: string; title: string }[];
  templates: { id: string; title: string }[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [threadList, setThreadList] = useState(threads);
  const [threadId, setThreadId] = useState(initialBundle?.thread.id ?? "");
  const [messages, setMessages] = useState<Message[]>(initialBundle?.messages ?? []);
  const [message, setMessage] = useState("");
  const [contractId, setContractId] = useState("");
  const [leftContractId, setLeftContractId] = useState("");
  const [rightContractId, setRightContractId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [pending, setPending] = useState(false);

  function applyBundle(bundle: Bundle) {
    setThreadId(bundle.thread.id);
    setMessages(bundle.messages);
    setThreadList((current) => {
      const rest = current.filter((row) => row.id !== bundle.thread.id);
      return [bundle.thread, ...rest];
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setPending(true);
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: threadId || undefined,
        message: trimmed,
        contractId: contractId || undefined,
        leftContractId: leftContractId || undefined,
        rightContractId: rightContractId || undefined,
        templateId: templateId || undefined,
      }),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Assistant could not answer",
        description: payload?.error ?? "The server refused this request.",
      });
      return;
    }
    const bundle = (await response.json()) as Bundle;
    setMessage("");
    applyBundle(bundle);
    router.replace(`/studio?thread=${bundle.thread.id}`);
  }

  async function decide(proposalId: string, action: "confirm" | "reject") {
    setPending(true);
    const response = await fetch(`/api/assistant/proposals/${proposalId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: action === "confirm" ? "Could not create draft" : "Could not reject draft",
        description: payload?.error ?? "The server refused this request.",
      });
      return;
    }
    notify({
      tone: "success",
      title: action === "confirm" ? "Draft contract created" : "Draft discarded",
    });
    if (threadId) {
      const refreshed = await fetch(`/api/assistant/threads/${threadId}`);
      if (refreshed.ok) applyBundle((await refreshed.json()) as Bundle);
    }
    router.refresh();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(message);
  }

  function newConversation() {
    setThreadId("");
    setMessages([]);
    router.replace("/studio");
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-3">
        <Button variant="secondary" onClick={newConversation}>
          New conversation
        </Button>
        {threadList.length === 0 ? (
          <p className="text-small text-ink-muted">No saved threads yet.</p>
        ) : (
          <ul className="grid gap-1">
            {threadList.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={`w-full rounded-md px-3 py-2 text-left text-small ${
                    row.id === threadId
                      ? "bg-primary-soft text-ink"
                      : "text-ink hover:bg-primary-soft"
                  }`}
                  onClick={() => {
                    setThreadId(row.id);
                    void fetch(`/api/assistant/threads/${row.id}`)
                      .then(async (response) => {
                        if (!response.ok) return;
                        applyBundle((await response.json()) as Bundle);
                        router.replace(`/studio?thread=${row.id}`);
                      })
                      .catch(() => undefined);
                  }}
                >
                  {row.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="grid gap-6">
        {status.provider === "none" && (
          <Alert tone="warning" title="AI is not connected">
            <p>
              Document questions that need a model stay unanswered. Search, obligations, playbook
              drafts, and stored contract fields still run from authorized records. The API key is
              never shown here.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              {status.setup.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Alert>
        )}
        {status.synthetic && (
          <Alert tone="info" title="Synthetic evaluation fixtures">
            LLM_PROVIDER=fixture only analyzes documents that contain an ACCORDIQ_FIXTURE marker.
          </Alert>
        )}
        {status.available && !status.synthetic && (
          <Alert tone="success" title="Live provider connected">
            Provider {status.provider}
            {status.model ? ` · ${status.model}` : ""}. Retrieved contract text is still untrusted
            data. Generated language is not legally validated.
          </Alert>
        )}

        <Alert tone="info" title="Research assistant, not legal advice">
          Answers are limited to contracts you can access. Citations must match source text.
          Insufficient evidence is stated. Creating a draft requires confirmation and
          contracts:write. Generated language is not legally validated.
        </Alert>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contract for questions">
              <Select value={contractId} onChange={(event) => setContractId(event.target.value)}>
                <option value="">Select a contract</option>
                {contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Approved template">
              <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">All approved templates</option>
                {templates.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Compare left">
              <Select
                value={leftContractId}
                onChange={(event) => setLeftContractId(event.target.value)}
              >
                <option value="">Select left agreement</option>
                {contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Compare right">
              <Select
                value={rightContractId}
                onChange={(event) => setRightContractId(event.target.value)}
              >
                <option value="">Select right agreement</option>
                {contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Button
                key={prompt.label}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void send(prompt.message)}
              >
                {prompt.label}
              </Button>
            ))}
          </div>

          {messages.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Ask about authorized contracts"
              description="Search this organization, compare stored terms, list upcoming obligations, or draft from approved playbook language. Select a contract before asking about governing law."
            />
          ) : (
            <ol className="grid gap-4" aria-live="polite">
              {messages.map((row) => (
                <li key={row.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={row.role === "USER" ? "neutral" : "info"}>
                        {row.role === "USER" ? "You" : "Assistant"}
                      </Badge>
                      {row.intent && <Badge>{INTENT_LABELS[row.intent] ?? row.intent}</Badge>}
                      {row.insufficientEvidence && (
                        <Badge tone="warning">Insufficient evidence</Badge>
                      )}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-small text-ink">{row.content}</p>
                    {row.disclaimer && (
                      <p className="mt-3 text-caption text-ink">{row.disclaimer}</p>
                    )}
                    {row.citations.length > 0 && (
                      <ul className="mt-3 grid gap-2">
                        {row.citations.map((citation) => (
                          <li key={citation.id} className="text-caption text-ink">
                            {citation.href ? (
                              <Link href={citation.href} className="text-primary underline">
                                {citation.sourceKind}
                                {citation.page ? ` · p. ${citation.page}` : ""}
                              </Link>
                            ) : (
                              <span>{citation.sourceKind}</span>
                            )}
                            {citation.quote ? ` — “${citation.quote}”` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.proposal && (
                      <div className="mt-4 rounded-md border border-line p-3">
                        <p className="font-medium text-ink">{row.proposal.title}</p>
                        <p className="mt-1 text-caption text-ink">
                          Status: {row.proposal.status}. Generated language is not legally
                          validated.
                        </p>
                        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-caption text-ink">
                          {row.proposal.body}
                        </pre>
                        {row.proposal.status === "PENDING_CONFIRMATION" && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              disabled={!canWrite}
                              loading={pending}
                              onClick={() => void decide(row.proposal!.id, "confirm")}
                            >
                              Confirm and create draft
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={!canWrite}
                              loading={pending}
                              onClick={() => void decide(row.proposal!.id, "reject")}
                            >
                              Discard
                            </Button>
                            {!canWrite && (
                              <p className="text-caption text-ink">
                                contracts:write is required to create the draft.
                              </p>
                            )}
                          </div>
                        )}
                        {row.proposal.createdContractId && (
                          <Link
                            href={`/contracts/${row.proposal.createdContractId}`}
                            className="mt-2 inline-block text-small text-primary underline"
                          >
                            Open draft contract
                          </Link>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          )}

          <Field
            label="Message"
            hint="The assistant only uses contracts in your current organization."
          >
            <Textarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void send(message);
                }
              }}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending}>
              Send
            </Button>
            {contractId && (
              <Link
                href={`/contracts/${contractId}#intelligence`}
                className="text-small text-primary underline"
              >
                Open contract intelligence
              </Link>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
