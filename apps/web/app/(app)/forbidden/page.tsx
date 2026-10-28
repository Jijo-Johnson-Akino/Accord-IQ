import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState, buttonClasses } from "@accordiq/ui";
import { OVERVIEW_HREF } from "../../../lib/navigation";

export const metadata: Metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <ErrorState
      headingLevel="h1"
      title="You do not have permission"
      description="This account cannot perform that action in the current organization. A hidden control is not a security boundary — the server refused the request."
      action={
        <Link href={OVERVIEW_HREF} className={buttonClasses({ variant: "primary" })}>
          Back to Overview
        </Link>
      }
    />
  );
}
