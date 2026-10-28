"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Accessible description. Prefer a short sentence of purpose, not a visible heading. */
  description?: string;
  side?: "left" | "right";
  children?: ReactNode;
}

/**
 * Side panel built on native `<dialog>`. Same focus trap, Escape-to-close and inert backdrop as
 * `Modal`, positioned against one edge for navigation drawers.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = "left",
  children,
}: DrawerProps) {
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
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "fixed m-0 h-full max-h-none w-[min(20rem,100%)] max-w-none border-line bg-surface p-0 text-ink shadow-lg",
        "backdrop:bg-navy/50",
        side === "left" ? "start-0 border-e" : "end-0 start-auto border-s",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-h4">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="sr-only">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-2 text-ink-muted transition-colors hover:bg-background hover:text-ink"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </dialog>
  );
}
