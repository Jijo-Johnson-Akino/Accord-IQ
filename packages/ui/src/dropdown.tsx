"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";
import { cn } from "./cn";

export interface DropdownAction {
  type?: "item";
  label: string;
  onSelect?: () => void;
  /** Renders a link instead of a button. */
  href?: string;
  icon?: LucideIcon;
  tone?: "default" | "danger";
  disabled?: boolean;
  description?: string;
}

export interface DropdownSeparator {
  type: "separator";
}

export type DropdownItem = DropdownAction | DropdownSeparator;

export interface DropdownMenuProps {
  /** Visible trigger label. Required unless `trigger` is provided. */
  label?: string;
  /** Custom trigger contents (icon, avatar). The wrapping element remains a `<button>`. */
  trigger?: ReactNode;
  /** Accessible name when the trigger has no visible text. */
  "aria-label"?: string;
  items: DropdownItem[];
  align?: "start" | "end";
  variant?: ButtonVariant;
  size?: ButtonSize;
  showChevron?: boolean;
  triggerClassName?: string;
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

function isAction(item: DropdownItem): item is DropdownAction {
  return item.type !== "separator";
}

/**
 * Action menu following the WAI-ARIA menu-button pattern: Enter/Space/ArrowDown opens, arrow keys
 * move, Home/End jump, Escape closes and restores focus, Tab and outside clicks close.
 */
export function DropdownMenu({
  label,
  trigger,
  "aria-label": ariaLabel,
  items,
  align = "start",
  variant = "secondary",
  size = "md",
  showChevron,
  triggerClassName,
}: DropdownMenuProps) {
  const triggerId = useId();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<"first" | "last">("first");
  const chevron = showChevron ?? !trigger;

  const menuItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  useEffect(() => {
    if (!open) return;
    const list = menuItems();
    (initialFocus.current === "last" ? list.at(-1) : list[0])?.focus();
    initialFocus.current = "first";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = menuItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return focusAt(index + 1);
      case "ArrowUp":
        return focusAt(index - 1);
      case "Home":
        return focusAt(0);
      case "End":
        return focusAt(list.length - 1);
      case "Escape":
        event.preventDefault();
        return closeAndRestoreFocus();
      case "Tab":
        return setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={ariaLabel ?? (trigger ? label : undefined)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName ?? buttonClasses({ variant, size })}
      >
        {trigger ?? label}
        {chevron && (
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform duration-(--duration-fast)",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-40 mt-2 min-w-52 rounded-lg border border-line bg-surface p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, index) => {
            if (!isAction(item)) {
              return (
                <div key={`separator-${index}`} role="separator" className="my-1 h-px bg-line" />
              );
            }
            const className = cn(
              "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-small",
              "focus-visible:bg-primary-soft focus-visible:outline-none",
              item.tone === "danger"
                ? "text-error-strong hover:bg-error-soft focus-visible:bg-error-soft"
                : "text-ink hover:bg-primary-soft",
              item.disabled && "pointer-events-none opacity-50",
            );
            const content = (
              <>
                {item.icon && <item.icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
                <span className="min-w-0">
                  <span className="block">{item.label}</span>
                  {item.description && (
                    <span className="mt-0.5 block text-caption text-ink-muted">
                      {item.description}
                    </span>
                  )}
                </span>
              </>
            );
            return item.href && !item.disabled ? (
              <a
                key={item.label}
                role="menuitem"
                tabIndex={-1}
                href={item.href}
                className={className}
                onClick={() => setOpen(false)}
              >
                {content}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled || undefined}
                className={className}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect?.();
                  closeAndRestoreFocus();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
