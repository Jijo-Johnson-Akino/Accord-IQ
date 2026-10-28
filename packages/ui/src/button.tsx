import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-surface hover:bg-primary-hover active:bg-primary-strong",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-background active:bg-primary-soft",
  ghost: "text-ink hover:bg-primary-soft hover:text-primary-strong",
  danger: "bg-error text-surface hover:bg-error-strong",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-small",
  md: "h-10 gap-2 px-4 text-small",
  lg: "h-12 gap-2.5 px-6 text-body",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Class names for anything that should look like a button (e.g. a `next/link`). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap",
    "transition-colors duration-(--duration-fast) ease-(--ease-standard)",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<ButtonStyleOptions, "className"> {
  /** Shows a spinner, disables the button and sets `aria-busy`. */
  loading?: boolean;
  leadingIcon?: ReactNode;
}

export function Button({
  variant,
  size,
  className,
  loading = false,
  leadingIcon,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        leadingIcon
      )}
      {children}
    </button>
  );
}

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
};

export interface IconButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children">,
    Omit<ButtonStyleOptions, "className"> {
  /** Accessible name. Required because the button has no visible text. */
  label: string;
  children: ReactNode;
}

/** Square icon-only button. The `label` becomes `aria-label`. */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={buttonClasses({
        variant,
        size,
        className: cn("shrink-0 px-0", ICON_SIZES[size], className),
      })}
      {...props}
    >
      {children}
    </button>
  );
}
