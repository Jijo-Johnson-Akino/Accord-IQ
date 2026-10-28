"use client";

import { Button, ErrorState } from "@accordiq/ui";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      headingLevel="h1"
      title="This page failed to load"
      description="Your data was not changed. You can try again. If this keeps happening, the failure is on our side — this message does not include internal details."
      action={
        <Button onClick={reset} variant="secondary">
          Try again
        </Button>
      }
    />
  );
}
