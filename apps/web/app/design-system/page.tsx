import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Plus, RotateCw } from "lucide-react";
import { BRAND } from "@accordiq/core";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  LogoMark,
  Select,
  Skeleton,
  Spinner,
  SuccessState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
  Wordmark,
  buttonClasses,
} from "@accordiq/ui";
import { colors } from "@accordiq/ui/tokens";
import { InteractiveDemo } from "./interactive-demo";

export const metadata: Metadata = {
  title: "Design system",
  description: "AccordIQ brand, tokens and component reference.",
  robots: { index: false, follow: false },
};

const SWATCHES: Array<{ name: string; token: keyof typeof colors; use: string }> = [
  { name: "Navy", token: "navy", use: "Brand, headings, tooltips" },
  { name: "Primary blue", token: "primary", use: "Actions, links, focus" },
  { name: "Pale blue", token: "primarySoft", use: "Selected, info surfaces" },
  { name: "Background", token: "background", use: "Page canvas" },
  { name: "Surface", token: "surface", use: "Cards, inputs" },
  { name: "Text", token: "ink", use: "Primary text" },
  { name: "Text secondary", token: "inkMuted", use: "Supporting text" },
  { name: "Border", token: "line", use: "Dividers, card borders" },
  { name: "Border strong", token: "lineStrong", use: "Input borders (3:1)" },
  { name: "Success", token: "success", use: "Positive status" },
  { name: "Warning", token: "warning", use: "Needs attention" },
  { name: "Error", token: "error", use: "Failure, destructive" },
];

const TYPE_SCALE = [
  { cls: "text-display", name: "Display", sample: "Under control" },
  { cls: "text-h1 font-bold tracking-tight", name: "Heading 1", sample: "Contract overview" },
  { cls: "text-h2 font-semibold", name: "Heading 2", sample: "Upcoming renewals" },
  { cls: "text-h3 font-semibold", name: "Heading 3", sample: "Payment terms" },
  { cls: "text-h4 font-semibold", name: "Heading 4", sample: "Termination clause" },
  { cls: "text-lead", name: "Lead", sample: "Every commitment, linked to its source." },
  { cls: "text-body", name: "Body", sample: "Standard paragraph text for reading." },
  { cls: "text-small", name: "Small", sample: "Table cells, helper text, metadata." },
  { cls: "text-caption", name: "Caption", sample: "Labels and timestamps" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-section first:mt-12">
      <h2 id={id} className="border-b border-line pb-3">
        {title}
      </h2>
      <div className="mt-6 grid gap-8">{children}</div>
    </section>
  );
}

function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-small font-semibold text-ink-muted">{label}</h3>
      {children}
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-5xl px-gutter py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" aria-label="AccordIQ home" className="rounded-md">
          <Wordmark />
        </Link>
        <Badge tone="warning" dot>
          Internal reference
        </Badge>
      </header>

      <main id="main">
        <h1 className="mt-12 text-display">Design system</h1>
        <p className="mt-4 max-w-2xl text-lead text-ink-muted">
          {BRAND.tagline} Tokens and components for the AccordIQ interface: light mode, one
          restrained accent, no gradients.
        </p>

        <Section id="logo" title="Logo">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="flex flex-col items-center justify-center gap-6 py-10">
              <Wordmark className="scale-125" />
              <LogoMark className="size-16" />
            </Card>
            <div className="flex flex-col items-center justify-center gap-6 rounded-lg bg-navy py-10">
              <Wordmark tone="reversed" className="scale-125" />
              <LogoMark tone="reversed" className="size-16" />
            </div>
          </div>
          <p className="max-w-2xl text-small text-ink-muted">
            Three connected nodes form an &ldquo;A&rdquo;: two parties and the commitment they
            share, joined by the agreement crossbar. Keep clear space of at least half the tile
            width, never recolor the mark, and never use it smaller than 16px.
          </p>
        </Section>

        <Section id="color" title="Color">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SWATCHES.map(({ name, token, use }) => (
              <li
                key={token}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3"
              >
                <span
                  aria-hidden
                  className="size-12 shrink-0 rounded-md border border-line"
                  style={{ backgroundColor: colors[token] }}
                />
                <div className="min-w-0 text-small">
                  <p className="font-semibold">{name}</p>
                  <p className="font-mono text-caption text-ink-muted">{colors[token]}</p>
                  <p className="text-caption text-ink-muted">{use}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="typography" title="Typography">
          <p className="text-small text-ink-muted">
            Inter with system fallbacks. Headings are tightened and balanced; body copy keeps a 1.6
            line height for long contract text.
          </p>
          <dl className="grid gap-5">
            {TYPE_SCALE.map(({ cls, name, sample }) => (
              <div
                key={name}
                className="grid gap-1 border-b border-line pb-5 sm:grid-cols-[8rem_1fr] sm:items-baseline"
              >
                <dt className="text-caption font-medium text-ink-muted">{name}</dt>
                <dd className={cls}>{sample}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="shape" title="Radii, shadows and focus">
          <div className="grid gap-4 sm:grid-cols-4">
            {(
              [
                ["rounded-sm shadow-xs", "sm / xs"],
                ["rounded-md shadow-sm", "md / sm"],
                ["rounded-lg shadow-md", "lg / md"],
                ["rounded-xl shadow-lg", "xl / lg"],
              ] as const
            ).map(([cls, label]) => (
              <div
                key={label}
                className={`flex h-24 items-center justify-center border border-line bg-surface text-small text-ink-muted ${cls}`}
              >
                {label}
              </div>
            ))}
          </div>
          <p className="text-small text-ink-muted">
            Keyboard focus is a 2px primary outline with a 2px offset on every interactive element.
            Press Tab on this page to see it.
          </p>
        </Section>

        <Section id="buttons" title="Buttons">
          <Demo label="Variants">
            <div className="flex flex-wrap gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </Demo>
          <Demo label="Sizes">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button leadingIcon={<Plus aria-hidden className="size-4" />}>With icon</Button>
            </div>
          </Demo>
          <Demo label="States">
            <div className="flex flex-wrap gap-3">
              <Button loading>Saving</Button>
              <Button disabled>Disabled</Button>
              <Link href="/dashboard" className={buttonClasses({ variant: "secondary" })}>
                Link styled as button
              </Link>
            </div>
          </Demo>
        </Section>

        <Section id="forms" title="Form controls">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contract title" hint="Shown in lists and search results." required>
              <Input placeholder="e.g. Master Services Agreement" />
            </Field>
            <Field label="Counterparty" error="Counterparty is required.">
              <Input defaultValue="" />
            </Field>
            <Field label="Contract type">
              <Select defaultValue="msa">
                <option value="msa">Master services agreement</option>
                <option value="nda">Non-disclosure agreement</option>
                <option value="sow">Statement of work</option>
              </Select>
            </Field>
            <Field label="Disabled field">
              <Input disabled defaultValue="Read only value" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea placeholder="Add context for reviewers" />
            </Field>
          </div>
        </Section>

        <Section id="badges" title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Draft</Badge>
            <Badge tone="info" dot>
              In review
            </Badge>
            <Badge tone="success" dot>
              Active
            </Badge>
            <Badge tone="warning" dot>
              Expiring soon
            </Badge>
            <Badge tone="error" dot>
              Overdue
            </Badge>
          </div>
        </Section>

        <Section id="overlays" title="Tooltip, modal, dropdown and notifications">
          <InteractiveDemo />
        </Section>

        <Section id="alerts" title="Alerts">
          <div className="grid gap-3">
            <Alert tone="info" title="Review in progress">
              Legal is reviewing this contract. You will be notified when it is approved.
            </Alert>
            <Alert tone="success" title="Contract saved">
              All changes have been saved.
            </Alert>
            <Alert tone="warning" title="Renewal in 14 days">
              Auto-renews unless notice is given by 30 November.
            </Alert>
            <Alert tone="error" title="Upload failed">
              The file could not be processed. Check the format and try again.
            </Alert>
          </div>
        </Section>

        <Section id="table" title="Table">
          <Table caption="Example contracts (sample data)">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Contract</TableHeaderCell>
                <TableHeaderCell>Counterparty</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Value</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Master services agreement</TableCell>
                <TableCell>Northwind Ltd</TableCell>
                <TableCell>
                  <Badge tone="success" dot>
                    Active
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">$240,000</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Mutual NDA</TableCell>
                <TableCell>Contoso</TableCell>
                <TableCell>
                  <Badge tone="info" dot>
                    In review
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">—</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Hosting agreement</TableCell>
                <TableCell>Fabrikam Cloud</TableCell>
                <TableCell>
                  <Badge tone="warning" dot>
                    Expiring soon
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">$58,500</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section id="states" title="Loading, empty, error and success states">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-0">
              <LoadingState label="Loading contracts" />
            </Card>
            <Card className="grid content-center gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <div className="flex items-center gap-2 pt-2 text-small text-ink-muted">
                <Spinner label="Extracting metadata" className="size-4" />
                Extracting metadata…
              </div>
            </Card>
            <Card className="p-0">
              <EmptyState
                headingLevel="h3"
                title="No contracts yet"
                description="Upload your first contract to start tracking commitments."
                action={
                  <Button leadingIcon={<Plus aria-hidden className="size-4" />}>
                    Upload contract
                  </Button>
                }
              />
            </Card>
            <Card className="p-0">
              <ErrorState
                headingLevel="h3"
                title="We couldn't load contracts"
                description="Something went wrong on our side. Your data is safe."
                action={
                  <Button
                    variant="secondary"
                    leadingIcon={<RotateCw aria-hidden className="size-4" />}
                  >
                    Try again
                  </Button>
                }
              />
            </Card>
            <Card className="p-0 md:col-span-2">
              <SuccessState
                headingLevel="h3"
                title="Contract submitted for approval"
                description="Approvers have been notified. You will get an email when a decision is made."
              />
            </Card>
          </div>
        </Section>
      </main>
    </div>
  );
}
