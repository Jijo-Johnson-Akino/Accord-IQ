import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@accordiq/auth";
import { isAppError, parsePage } from "@accordiq/core";
import { ClauseDetail } from "../../../../components/clauses/clause-detail";
import { getRuntime } from "../../../../lib/runtime";
import { requireActor } from "../../../../lib/session";

export const metadata: Metadata = { title: "Clause" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function ClauseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(`/clauses/${id}`);
  const { clm } = await getRuntime();
  let loaded: {
    clause: Awaited<ReturnType<typeof clm.getClause>>;
    contracts: { id: string; title: string }[];
    otherClauses: { id: string; title: string; code: string }[];
  };
  try {
    const [clause, contracts, listed] = await Promise.all([
      clm.getClause(actor, id),
      clm.listContracts(actor, parsePage(new URLSearchParams("limit=100"))),
      clm.listClauses(actor, parsePage(new URLSearchParams("limit=100"))),
    ]);
    loaded = {
      clause,
      contracts: contracts.items.map((row) => ({ id: row.id, title: row.title })),
      otherClauses: listed.items
        .filter((row) => row.id !== id)
        .map((row) => ({ id: row.id, title: row.title, code: row.code })),
    };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1>{loaded.clause.template.title}</h1>
      <ClauseDetail
        canManage={can(actor, "clauses:manage")}
        initial={serialize(loaded.clause)}
        contracts={loaded.contracts}
        otherClauses={loaded.otherClauses}
      />
    </div>
  );
}
