import type { Metadata } from "next";
import { can } from "@accordiq/auth";
import { parsePage } from "@accordiq/core";
import { ObligationsWorkspace } from "../../../components/obligations/obligations-workspace";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "Obligations" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function ObligationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  const item = requireNavItem("/obligations");
  const actor = await requireActor("/obligations");
  const { view: viewParam, status = "" } = await searchParams;
  const view = viewParam === "calendar" || viewParam === "renewals" ? viewParam : "list";
  const { access, clm } = await getRuntime();
  const page = parsePage(new URLSearchParams("limit=100"));
  const [settings, obligations, calendar, renewals, contracts, members, workflows] =
    await Promise.all([
      clm.getMonitoringSettings(actor),
      clm.listObligations(actor, page, { status: status || null }),
      clm.listObligationCalendar(actor, {}),
      clm.listRenewals(actor, page, { status: view === "renewals" ? status || null : null }),
      clm.listContracts(actor, page),
      access.listMembers(actor),
      clm.listWorkflows(actor),
    ]);

  return (
    <div className="mx-auto max-w-6xl">
      <h1>{item.label}</h1>
      <p className="mt-2 text-ink-muted">{item.description}</p>
      <ObligationsWorkspace
        canWrite={can(actor, "contracts:write")}
        userId={actor.userId}
        view={view}
        status={status}
        timezone={settings.timezone}
        today={settings.today}
        obligations={serialize(obligations.items)}
        calendar={serialize(calendar)}
        renewals={serialize(renewals.items)}
        contracts={serialize(contracts.items.map((row) => ({ id: row.id, title: row.title })))}
        members={serialize(
          members.map((member) => ({
            userId: member.userId,
            name: member.name,
            email: member.email,
          })),
        )}
        workflows={serialize(
          workflows.map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            status: workflow.status,
          })),
        )}
      />
    </div>
  );
}
