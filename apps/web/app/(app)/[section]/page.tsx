import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModulePlaceholder } from "../../../components/module-placeholder";
import { NAV_ITEMS, OVERVIEW_HREF } from "../../../lib/navigation";

interface SectionParams {
  params: Promise<{ section: string }>;
}

/** Routes that have a dedicated `page.tsx` next to this catch-all. */
const DEDICATED = new Set([
  OVERVIEW_HREF,
  "/settings",
  "/contracts",
  "/studio",
  "/clauses",
  "/approvals",
  "/workflows",
  "/integrations",
  "/obligations",
  "/finance",
]);

function itemForSection(section: string) {
  const href = `/${section}`;
  if (DEDICATED.has(href)) return undefined;
  return NAV_ITEMS.find((item) => item.href === href);
}

export const dynamicParams = false;

export function generateStaticParams() {
  return NAV_ITEMS.filter((item) => !DEDICATED.has(item.href)).map((item) => ({
    section: item.href.slice(1),
  }));
}

export async function generateMetadata({ params }: SectionParams): Promise<Metadata> {
  const { section } = await params;
  const item = itemForSection(section);
  return { title: item?.label ?? "Not found" };
}

export default async function SectionPage({ params }: SectionParams) {
  const { section } = await params;
  const item = itemForSection(section);
  if (!item) notFound();
  return <ModulePlaceholder href={item.href} />;
}
