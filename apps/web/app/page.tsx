import Link from "next/link";
import { ArrowRight, FileText, ListChecks, ShieldCheck } from "lucide-react";
import { BRAND } from "@accordiq/core";
import { Badge, Wordmark, buttonClasses } from "@accordiq/ui";

const PILLARS = [
  {
    icon: FileText,
    title: "Every contract",
    body: "One secure repository for every agreement, version and amendment, searchable the moment it lands.",
  },
  {
    icon: ListChecks,
    title: "Every commitment",
    body: "AI surfaces the dates, obligations and money buried in the text, each linked back to its source clause.",
  },
  {
    icon: ShieldCheck,
    title: "Under control",
    body: "Explainable risk, approvals and a full audit trail keep your team accountable and your data isolated.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-gutter">
      <header className="flex items-center justify-between py-6">
        <Link href="/" aria-label="AccordIQ home" className="rounded-md">
          <Wordmark />
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href="/signup" className={buttonClasses({ variant: "secondary" })}>
            Create account
          </Link>
          <Link href="/login" className={buttonClasses({ variant: "secondary" })}>
            Sign in
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="py-16 sm:py-24">
          <Badge tone="info" dot>
            Early foundation build
          </Badge>
          <h1 className="mt-6 max-w-3xl text-display">{BRAND.tagline}</h1>
          <p className="mt-6 max-w-2xl text-lead text-ink-muted">
            {BRAND.category}. AccordIQ turns contracts into commitments you can see, trust and act
            on, from first upload to renewal.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className={buttonClasses({ size: "lg" })}>
              Create an account
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/login" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              Sign in
            </Link>
          </div>
        </section>

        <section aria-labelledby="pillars" className="pb-section">
          <h2 id="pillars" className="sr-only">
            What AccordIQ gives you
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-lg border border-line bg-surface p-card shadow-xs">
                <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary-strong">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="mt-4">{title}</h3>
                <p className="mt-2 text-small text-ink-muted">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-small text-ink-muted">
        © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}
      </footer>
    </div>
  );
}
