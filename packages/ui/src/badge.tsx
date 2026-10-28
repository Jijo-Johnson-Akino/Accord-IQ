import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "error";

const TONES: Record<BadgeTone, { container: string; dot: string }> = {
  neutral: { container: "bg-line/60 text-ink", dot: "bg-ink-muted" },
  info: { container: "bg-primary-soft text-primary-strong", dot: "bg-primary" },
  success: { container: "bg-success-soft text-success-strong", dot: "bg-success" },
  warning: { container: "bg-warning-soft text-warning-strong", dot: "bg-warning" },
  error: { container: "bg-error-soft text-error-strong", dot: "bg-error" },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Adds a status dot so meaning is not conveyed by color alone when paired with text. */
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const styles = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-caption font-medium",
        styles.container,
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", styles.dot)} />}
      {children}
    </span>
  );
}
