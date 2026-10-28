import type { Metadata } from "next";
import { parsePage } from "@accordiq/core";
import { ApprovalsList } from "../../../components/approvals/approvals-list";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "Approvals" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const item = requireNavItem("/approvals");
  const actor = await requireActor("/approvals");
  const { status } = await searchParams;
  const { clm } = await getRuntime();
  const listed = await clm.listApprovals(actor, parsePage(new URLSearchParams("limit=100")), {
    status: status ?? null,
  });
  return (
    <div className="mx-auto max-w-5xl">
      <h1>{item.label}</h1>
      <p className="mt-2 text-ink-muted">{item.description}</p>
      <ApprovalsList items={serialize(listed.items)} status={status ?? ""} />
    </div>
  );
}
