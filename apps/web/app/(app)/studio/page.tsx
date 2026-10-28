import type { Metadata } from "next";
import { can } from "@accordiq/auth";
import { parsePage } from "@accordiq/core";
import { StudioWorkspace } from "../../../components/studio/studio-workspace";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "AI Contract Studio" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const item = requireNavItem("/studio");
  const actor = await requireActor("/studio");
  const { thread: threadId } = await searchParams;
  const { clm } = await getRuntime();
  const page = parsePage(new URLSearchParams("limit=50"));
  const [status, contracts, clauses, threads] = await Promise.all([
    clm.getAiStatus(actor),
    clm.listContracts(actor, page),
    clm.listClauses(actor, page, { status: "APPROVED" }),
    clm.listAssistantThreads(actor),
  ]);
  let initialBundle = null;
  if (threadId) {
    try {
      initialBundle = await clm.getAssistantThread(actor, threadId);
    } catch {
      initialBundle = null;
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1>{item.label}</h1>
      <p className="mt-2 text-ink-muted">{item.description}</p>
      <StudioWorkspace
        canWrite={can(actor, "contracts:write")}
        status={serialize(status)}
        threads={serialize(threads)}
        initialBundle={initialBundle ? serialize(initialBundle) : null}
        contracts={serialize(contracts.items.map((row) => ({ id: row.id, title: row.title })))}
        templates={serialize(clauses.items.map((row) => ({ id: row.id, title: row.title })))}
      />
    </div>
  );
}
