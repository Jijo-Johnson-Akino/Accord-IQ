import type { Metadata } from "next";
import { EmptyState } from "@accordiq/ui";
import { Building2 } from "lucide-react";

export const metadata: Metadata = { title: "No organization" };

export default function NoOrganizationPage() {
  return (
    <EmptyState
      icon={Building2}
      headingLevel="h1"
      title="No organization selected"
      description="This account is signed in but has no active organization. Use the organization switcher if you belong to one. Tenant records stay hidden until then."
    />
  );
}
