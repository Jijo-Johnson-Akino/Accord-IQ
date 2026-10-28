import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Keyboard shortcut hint. Hidden from the accessibility tree when it only duplicates visible text. */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded-sm border border-line bg-background px-1.5 py-0.5 font-mono text-caption text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}
