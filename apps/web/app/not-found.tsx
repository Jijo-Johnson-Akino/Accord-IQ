import Link from "next/link";
import { EmptyState, Wordmark, buttonClasses } from "@accordiq/ui";

export default function RootNotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-gutter py-16">
      <Link href="/" aria-label="AccordIQ home" className="mb-10 rounded-md">
        <Wordmark />
      </Link>
      <EmptyState
        headingLevel="h1"
        title="Page not found"
        description="That URL is not part of AccordIQ. Go to the public homepage or open the workspace."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/" className={buttonClasses({ variant: "secondary" })}>
              Home
            </Link>
            <Link href="/login" className={buttonClasses({ variant: "primary" })}>
              Sign in
            </Link>
          </div>
        }
      />
    </div>
  );
}
