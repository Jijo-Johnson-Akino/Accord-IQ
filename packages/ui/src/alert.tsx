import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { TONE_STYLES, type Tone } from "./tones";

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: Tone;
  title?: ReactNode;
}

/**
 * Inline notification. Errors use `role="alert"` (announced immediately); other tones use
 * `role="status"` (announced politely).
 */
export function Alert({ tone = "info", title, className, children, ...props }: AlertProps) {
  const { container, icon, Icon } = TONE_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-4", container, className)}
      {...props}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", icon)} />
      <div className="min-w-0 text-small text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {/* Primary text color: secondary text does not meet AA on tinted backgrounds. */}
        {children && <div className={cn(title && "mt-1")}>{children}</div>}
      </div>
    </div>
  );
}
