import Link from "next/link";
import { EmptyState, buttonClasses } from "@accordiq/ui";
import { OVERVIEW_HREF } from "../../lib/navigation";

export default function AppNotFound() {
  return (
    <EmptyState
      headingLevel="h1"
      title="Page not found"
      description="That address is not a workspace section. Check the URL, or go back to Overview."
      action={
        <Link href={OVERVIEW_HREF} className={buttonClasses({ variant: "primary" })}>
          Back to Overview
        </Link>
      }
    />
  );
}
