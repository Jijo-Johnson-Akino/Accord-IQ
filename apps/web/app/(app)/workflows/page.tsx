import type { Metadata } from "next";
import { can } from "@accordiq/auth";
import { WorkflowLibrary } from "../../../components/approvals/workflow-library";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "Workflows" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function WorkflowsPage() {
  const item = requireNavItem("/workflows");
  const actor = await requireActor("/workflows");
  const { clm } = await getRuntime();
  const workflows = await clm.listWorkflows(actor);
  return (
    <div className="mx-auto max-w-5xl">
      <h1>{item.label}</h1>
      <p className="mt-2 text-ink-muted">{item.description}</p>
      <WorkflowLibrary canManage={can(actor, "workflows:manage")} items={serialize(workflows)} />
    </div>
  );
}
