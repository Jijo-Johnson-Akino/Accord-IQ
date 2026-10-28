"use client";

import Link from "next/link";
import { Button, Field, Input, Select } from "@accordiq/ui";
import { CATEGORY_LABELS, CATEGORY_OPTIONS, LIFECYCLE_LABELS, STATUS_OPTIONS } from "./labels";

export function ContractsFilters({
  query,
  vendors,
}: {
  query: {
    q: string;
    status: string;
    category: string;
    vendorId: string;
    expiresAfter: string;
    expiresBefore: string;
  };
  vendors: { id: string; name: string }[];
}) {
  return (
    <form method="get" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Search">
        <Input name="q" defaultValue={query.q} placeholder="Title or counterparty" />
      </Field>
      <Field label="Lifecycle">
        <Select name="status" defaultValue={query.status}>
          <option value="">Any</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {LIFECYCLE_LABELS[status]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Category">
        <Select name="category" defaultValue={query.category}>
          <option value="">Any</option>
          {CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Counterparty">
        <Select name="vendorId" defaultValue={query.vendorId}>
          <option value="">Any</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Expires after">
        <Input name="expiresAfter" type="date" defaultValue={query.expiresAfter} />
      </Field>
      <Field label="Expires before">
        <Input name="expiresBefore" type="date" defaultValue={query.expiresBefore} />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit">Apply filters</Button>
        <Link className="text-small text-primary-strong underline" href="/contracts">
          Clear
        </Link>
      </div>
    </form>
  );
}
