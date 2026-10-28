import type { Metadata } from "next";
import { OverviewDashboard } from "../../../components/overview-dashboard";
import { getOverviewSnapshot } from "../../../lib/demo-data";

export const metadata: Metadata = { title: "Overview" };

export default function DashboardPage() {
  return <OverviewDashboard snapshot={getOverviewSnapshot()} />;
}
