import { CircleAlert, CircleCheck, Inbox, LoaderCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/** Inline spinner with an accessible label. Respects `prefers-reduced-motion`. */
export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <LoaderCircle
        aria-hidden
        className={cn("size-5 animate-spin text-primary motion-reduce:animate-none", className)}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Placeholder block shown while content loads. Hidden from assistive tech. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-md bg-line motion-safe:animate-pulse", className)} />
  );
}

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <Spinner label={label} className="size-7" />
      <p aria-hidden className="text-small text-ink-muted">
        {label}…
      </p>
    </div>
  );
}

type StateTone = "neutral" | "success" | "error";

const STATE_TONES: Record<StateTone, string> = {
  neutral: "bg-primary-soft text-primary-strong",
  success: "bg-success-soft text-success-strong",
  error: "bg-error-soft text-error-strong",
};

interface StateShellProps {
  icon: LucideIcon;
  tone: StateTone;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: "h1" | "h2" | "h3" | "h4";
  role?: "status" | "alert";
  className?: string;
}

function StateShell({
  icon: Icon,
  tone,
  title,
  description,
  action,
  headingLevel: Heading = "h3",
  role,
  className,
}: StateShellProps) {
  return (
    <div
      role={role}
      className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}
    >
      <span
        aria-hidden
        className={cn("flex size-12 items-center justify-center rounded-full", STATE_TONES[tone])}
      >
        <Icon className="size-6" />
      </span>
      <Heading className="text-h4">{title}</Heading>
      {description && <p className="max-w-md text-small text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

type StateProps = Omit<StateShellProps, "tone" | "icon" | "role"> & { icon?: LucideIcon };

/** Nothing here yet: explain why and offer the next step. */
export function EmptyState({ icon = Inbox, ...props }: StateProps) {
  return <StateShell icon={icon} tone="neutral" {...props} />;
}

/** Something failed: say what happened and offer a way to recover. Announced as an alert. */
export function ErrorState({ icon = CircleAlert, ...props }: StateProps) {
  return <StateShell icon={icon} tone="error" role="alert" {...props} />;
}

/** An action completed. Announced politely. */
export function SuccessState({ icon = CircleCheck, ...props }: StateProps) {
  return <StateShell icon={icon} tone="success" role="status" {...props} />;
}
