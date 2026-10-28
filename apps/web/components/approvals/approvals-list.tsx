"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  EmptyState,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@accordiq/ui";
import { GitPullRequestArrow } from "lucide-react";
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_OPTIONS,
  approvalTone,
  formatWhen,
} from "./labels";

type ApprovalRow = {
  id: string;
  status: string;
  stale: boolean;
  contractId: string;
  contractTitle: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export function ApprovalsList({ items, status }: { items: ApprovalRow[]; status: string }) {
  const router = useRouter();

  return (
    <>
      <form className="mt-6 max-w-xs">
        <Select
          name="status"
          defaultValue={status}
          aria-label="Filter by status"
          onChange={(event) => {
            const next = event.currentTarget.value;
            router.push(next ? `/approvals?status=${encodeURIComponent(next)}` : "/approvals");
          }}
        >
          <option value="">All statuses</option>
          {APPROVAL_STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {APPROVAL_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </form>

      {items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={GitPullRequestArrow}
          title="No approval requests"
          description="Start a workflow from a contract. The server, not this page, decides who can act."
        />
      ) : (
        <Table className="mt-6" caption="Approval requests">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Contract</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Updated</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link className="text-primary-strong underline" href={`/approvals/${row.id}`}>
                    {row.contractTitle}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={approvalTone(row.status)} dot>
                      {APPROVAL_STATUS_LABELS[row.status as keyof typeof APPROVAL_STATUS_LABELS] ??
                        row.status}
                    </Badge>
                    {row.stale && (
                      <Badge tone="error" dot>
                        Stale
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{formatWhen(row.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
