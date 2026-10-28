import type { Metadata } from "next";
import { can } from "@accordiq/auth";
import { parsePage } from "@accordiq/core";
import { FinanceWorkspace } from "../../../components/finance/finance-workspace";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "Financial Intelligence" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string; vendorId?: string; statusGroup?: string }>;
}) {
  const item = requireNavItem("/finance");
  const actor = await requireActor("/finance");
  const { currency = "", vendorId = "", statusGroup = "" } = await searchParams;
  const { clm } = await getRuntime();
  const page = parsePage(new URLSearchParams("limit=100"));
  const filters = {
    currency: currency || null,
    vendorId: vendorId || null,
    statusGroup: statusGroup || null,
  };
  const [insights, milestones, transactions, escalations, savings, contracts, vendors] =
    await Promise.all([
      clm.getFinanceInsights(actor, filters),
      clm.listPaymentMilestones(actor, page),
      clm.listFinancialTransactions(actor, page, filters),
      clm.listPriceEscalations(actor, page),
      clm.listSavingsOpportunities(actor, page),
      clm.listContracts(actor, page),
      clm.listVendors(actor, page),
    ]);

  return (
    <div className="mx-auto max-w-6xl">
      <h1>{item.label}</h1>
      <p className="mt-2 text-ink-muted">{item.description}</p>
      <FinanceWorkspace
        canWriteFinance={can(actor, "finance:write")}
        canWriteContracts={can(actor, "contracts:write")}
        currency={currency}
        vendorId={vendorId}
        statusGroup={statusGroup}
        insights={serialize(insights)}
        milestones={serialize(milestones.items)}
        transactions={serialize(transactions.items)}
        escalations={serialize(escalations.items)}
        savings={serialize(savings.items)}
        contracts={serialize(contracts.items.map((row) => ({ id: row.id, title: row.title })))}
        vendors={serialize(vendors.items.map((row) => ({ id: row.id, name: row.name })))}
      />
    </div>
  );
}
