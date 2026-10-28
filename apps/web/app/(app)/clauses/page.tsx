import type { Metadata } from "next";
import { can } from "@accordiq/auth";
import { parsePage } from "@accordiq/core";
import { ClauseLibrary } from "../../../components/clauses/clause-library";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "Clause Library" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function ClausesPage() {
  const item = requireNavItem("/clauses");
  const actor = await requireActor("/clauses");
  const { clm } = await getRuntime();
  const listed = await clm.listClauses(actor, parsePage(new URLSearchParams("limit=100")));
  return (
    <div className="mx-auto max-w-5xl">
      <h1>{item.label}</h1>
      <p className="mt-2 text-ink-muted">{item.description}</p>
      <ClauseLibrary canManage={can(actor, "clauses:manage")} items={serialize(listed.items)} />
    </div>
  );
}
