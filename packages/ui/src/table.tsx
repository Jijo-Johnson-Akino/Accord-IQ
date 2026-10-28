import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "./cn";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Accessible name for the table and its scrollable region. Visually hidden. */
  caption: string;
}

/**
 * Responsive data table. The wrapper scrolls horizontally on narrow screens and is focusable so
 * keyboard users can scroll it.
 */
export function Table({ caption, className, children, ...props }: TableProps) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs"
    >
      <table
        className={cn("w-full min-w-[32rem] border-collapse text-left text-small", className)}
        {...props}
      >
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-line bg-background", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-background/70", className)} {...props} />;
}

export function TableHeaderCell({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-caption font-semibold tracking-wide text-ink-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle text-ink", className)} {...props} />;
}
