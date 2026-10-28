"use client";

import {
  cloneElement,
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export interface TooltipProps {
  content: ReactNode;
  side?: "top" | "bottom";
  /** A single focusable element (button, link, input). It receives `aria-describedby`. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

/**
 * Supplementary label shown on hover and keyboard focus. Dismissable with Escape, and stays open
 * while the pointer is over it (WCAG 1.4.13). Never put essential information only in a tooltip.
 */
export function Tooltip({ content, side = "top", children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      setOpen(false);
    }
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={onKeyDown}
    >
      {cloneElement(children, { "aria-describedby": id })}
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2",
          side === "top" ? "bottom-full pb-2" : "top-full pt-2",
          open ? "pointer-events-auto visible opacity-100" : "invisible opacity-0",
          "transition-opacity duration-(--duration-fast)",
        )}
      >
        <span
          role="tooltip"
          id={id}
          className="block w-max max-w-64 rounded-md bg-navy px-2.5 py-1.5 text-caption font-medium text-surface shadow-md"
        >
          {content}
        </span>
      </span>
    </span>
  );
}
