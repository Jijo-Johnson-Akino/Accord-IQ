"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Typically action buttons. Rendered in a bordered footer. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;

/**
 * Modal dialog built on the native `<dialog>` element, which provides focus trapping, Escape to
 * close, inert background and focus restoration without extra dependencies.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Fires for Escape and for programmatic close(); only notify the parent while it thinks
      // the dialog is open.
      onClose={() => {
        if (open) onClose();
      }}
      // A click on the <dialog> element itself (not its content) is a backdrop click.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-lg",
        "backdrop:bg-navy/50",
        SIZES[size],
      )}
    >
      <div className="flex items-start justify-between gap-4 p-6 pb-0">
        <div className="min-w-0">
          <h2 id={titleId} className="text-h3">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1.5 text-small text-ink-muted">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="-mt-1 -mr-2 rounded-md p-2 text-ink-muted transition-colors hover:bg-background hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      {children && <div className="p-6 text-small">{children}</div>}
      {footer && (
        <div className="flex flex-col-reverse gap-2 border-t border-line bg-background/60 px-6 py-4 sm:flex-row sm:justify-end">
          {footer}
        </div>
      )}
    </dialog>
  );
}
