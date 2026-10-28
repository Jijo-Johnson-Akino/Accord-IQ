import { ChevronDown, CircleAlert } from "lucide-react";
import {
  cloneElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

const CONTROL =
  "w-full rounded-md border border-line-strong bg-surface text-body text-ink " +
  "placeholder:text-ink-muted transition-shadow duration-(--duration-fast) " +
  "hover:border-ink-muted focus-visible:border-primary focus-visible:shadow-focus " +
  "aria-invalid:border-error disabled:cursor-not-allowed disabled:bg-background disabled:text-ink-muted";

export function Input({
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(CONTROL, "h-10 px-3", className)} {...props} />;
}

export function Textarea({
  className,
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(CONTROL, "px-3 py-2", className)} {...props} />;
}

/** Styled native `<select>`: keeps full keyboard, mobile and screen-reader behavior for free. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(CONTROL, "h-10 appearance-none pr-9 pl-3", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}

interface FieldControlProps {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  /** When set, the control is marked invalid and the message is announced via aria-describedby. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Exactly one control: `Input`, `Textarea` or `Select`. */
  children: ReactElement<FieldControlProps>;
}

/** Label + control + hint/error wiring (`for`, `aria-describedby`, `aria-invalid`). */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden className="text-error-strong">
            {" "}
            *
          </span>
        )}
      </label>
      {cloneElement(children, {
        id,
        required,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-caption text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-caption text-error-strong">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
