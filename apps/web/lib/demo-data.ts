export type DemoEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_DEMO_DATA?: string;
};

/**
 * Synthetic overview figures. Off by default. Production always returns empty, even if the
 * public flag is set — demo numbers must never ship as if they were real.
 */
export function isDemoDataEnabled(env: DemoEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.NEXT_PUBLIC_DEMO_DATA === "true";
}

export const LIFECYCLE_STAGES = [
  "Draft",
  "In review",
  "Negotiation",
  "Signed",
  "Active",
  "Expired",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export interface OverviewActivity {
  id: string;
  summary: string;
  when: string;
}

export interface OverviewRenewal {
  id: string;
  title: string;
  counterparty: string;
  due: string;
}

export interface OverviewSnapshot {
  source: "empty" | "demo";
  contracts: number | null;
  pendingApprovals: number | null;
  upcomingExpirations: number | null;
  activeObligations: number | null;
  risk: { high: number | null; medium: number | null; low: number | null };
  activity: OverviewActivity[];
  renewals: OverviewRenewal[];
  lifecycle: Array<{ stage: LifecycleStage; count: number | null }>;
}

const EMPTY: OverviewSnapshot = {
  source: "empty",
  contracts: null,
  pendingApprovals: null,
  upcomingExpirations: null,
  activeObligations: null,
  risk: { high: null, medium: null, low: null },
  activity: [],
  renewals: [],
  lifecycle: LIFECYCLE_STAGES.map((stage) => ({ stage, count: null })),
};

const DEMO: OverviewSnapshot = {
  source: "demo",
  contracts: 24,
  pendingApprovals: 3,
  upcomingExpirations: 5,
  activeObligations: 18,
  risk: { high: 2, medium: 7, low: 15 },
  activity: [
    { id: "a1", summary: "Mutual NDA marked in review", when: "2 hours ago" },
    { id: "a2", summary: "Hosting agreement assigned to Legal", when: "Yesterday" },
    { id: "a3", summary: "MSA uploaded by Alex Rivera", when: "3 days ago" },
  ],
  renewals: [
    { id: "r1", title: "Hosting agreement", counterparty: "Fabrikam Cloud", due: "14 Nov 2026" },
    { id: "r2", title: "Support addendum", counterparty: "Northwind Ltd", due: "2 Dec 2026" },
  ],
  lifecycle: [
    { stage: "Draft", count: 4 },
    { stage: "In review", count: 3 },
    { stage: "Negotiation", count: 2 },
    { stage: "Signed", count: 1 },
    { stage: "Active", count: 12 },
    { stage: "Expired", count: 2 },
  ],
};

export function getOverviewSnapshot(env: DemoEnv = process.env): OverviewSnapshot {
  return isDemoDataEnabled(env) ? DEMO : EMPTY;
}
