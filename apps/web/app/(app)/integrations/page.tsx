import type { Metadata } from "next";
import { can } from "@accordiq/auth";
import { parsePage } from "@accordiq/core";
import { Plug } from "lucide-react";
import { IntegrationsWorkspace } from "../../../components/integrations/integrations-workspace";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "Integrations" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function IntegrationsPage() {
  const item = requireNavItem("/integrations");
  const actor = await requireActor("/integrations");
  const { clm } = await getRuntime();
  const catalog = await clm.listIntegrations(actor);
  const canManage = can(actor, "settings:manage");
  const runs = canManage
    ? (await clm.listIntegrationRuns(actor, parsePage(new URLSearchParams("limit=20")))).items
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-start gap-3">
        <Plug aria-hidden className="mt-1 size-5 shrink-0 text-primary-strong" />
        <div>
          <h1>{item.label}</h1>
          <p className="mt-2 text-ink-muted">{item.description}</p>
        </div>
      </div>
      <p className="mt-4 text-small text-ink-muted">
        A provider is listed as connected only when it is actually configured on the server. Stored
        CRM or ERP secrets do not activate an adapter. API keys are never sent to the browser.
      </p>
      <div className="mt-6">
        <IntegrationsWorkspace
          items={serialize(catalog.items)}
          runs={serialize(runs)}
          organizationSlug={catalog.organizationSlug}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
