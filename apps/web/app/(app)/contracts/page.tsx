import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@accordiq/auth";
import { formatMinorAmount } from "../../../components/contracts/labels";
import { parsePage } from "@accordiq/core";
import {
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@accordiq/ui";
import { FileText } from "lucide-react";
import { ContractsFilters } from "../../../components/contracts/contracts-filters";
import { UploadContractDialog } from "../../../components/contracts/upload-contract-dialog";
import { CATEGORY_LABELS, LIFECYCLE_LABELS } from "../../../components/contracts/labels";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "Contracts" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hrefWith(current: URLSearchParams, patch: Record<string, string | null>): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (!value) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `/contracts?${query}` : "/contracts";
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = requireNavItem("/contracts");
  const actor = await requireActor("/contracts");
  const { clm } = await getRuntime();
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "category",
    "vendorId",
    "expiresAfter",
    "expiresBefore",
    "limit",
    "offset",
  ]) {
    const value = first(params[key]);
    if (value) query.set(key, value);
  }
  const page = parsePage(query);
  const [result, vendors] = await Promise.all([
    clm.listContracts(actor, page, {
      status: query.get("status"),
      category: query.get("category"),
      vendorId: query.get("vendorId"),
      expiresAfter: query.get("expiresAfter"),
      expiresBefore: query.get("expiresBefore"),
    }),
    clm.listVendors(actor, parsePage(new URLSearchParams("limit=100"))),
  ]);
  const canWrite = can(actor, "contracts:write");
  const prevOffset = Math.max(0, page.offset - page.limit);
  const nextOffset = page.offset + page.limit;
  const hasPrev = page.offset > 0;
  const hasNext = nextOffset < result.page.total;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{item.label}</h1>
          <p className="mt-2 text-ink-muted">{item.description}</p>
        </div>
        {canWrite && (
          <UploadContractDialog
            vendors={vendors.items.map((row) => ({ id: row.id, name: row.name }))}
          />
        )}
      </div>

      <ContractsFilters
        query={{
          q: query.get("q") ?? "",
          status: query.get("status") ?? "",
          category: query.get("category") ?? "",
          vendorId: query.get("vendorId") ?? "",
          expiresAfter: query.get("expiresAfter") ?? "",
          expiresBefore: query.get("expiresBefore") ?? "",
        }}
        vendors={vendors.items.map((row) => ({ id: row.id, name: row.name }))}
      />

      {result.items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={FileText}
          title="No contracts match these filters"
          description="Upload a PDF or DOCX, or clear the filters to see every contract in this organization."
        />
      ) : (
        <div className="mt-6">
          <Table caption="Contracts in this organization">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Counterparty</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Lifecycle</TableHeaderCell>
                <TableHeaderCell>Expires</TableHeaderCell>
                <TableHeaderCell>Value</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <Link className="text-primary-strong underline" href={`/contracts/${row.id}`}>
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell>{row.vendorName ?? "—"}</TableCell>
                  <TableCell>
                    {row.category
                      ? (CATEGORY_LABELS[row.category as keyof typeof CATEGORY_LABELS] ??
                        row.category)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge>
                      {LIFECYCLE_LABELS[row.status as keyof typeof LIFECYCLE_LABELS] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.expiresOn ?? "—"}</TableCell>
                  <TableCell>{formatMinorAmount(row.valueMinor, row.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-small text-ink-muted">
            <p>
              {result.page.total} contract{result.page.total === 1 ? "" : "s"} · showing{" "}
              {page.offset + 1}–{page.offset + result.items.length}
            </p>
            <div className="flex gap-2">
              {hasPrev ? (
                <Link
                  className="rounded-md border border-line-strong px-3 py-1.5 text-ink"
                  href={hrefWith(query, { offset: String(prevOffset) })}
                >
                  Previous
                </Link>
              ) : null}
              {hasNext ? (
                <Link
                  className="rounded-md border border-line-strong px-3 py-1.5 text-ink"
                  href={hrefWith(query, { offset: String(nextOffset) })}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
