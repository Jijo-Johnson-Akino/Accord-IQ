import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface BreadcrumbItem {
  label: string;
  /** Omit on the current page. When set, typically rendered as a link by the caller. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Render function so the app can use Next.js `<Link>` without this package depending on Next. */
  renderLink?: (item: BreadcrumbItem, className: string) => ReactNode;
  className?: string;
}

const LINK_CLASS = "rounded-sm text-ink-muted hover:text-ink";

/**
 * Breadcrumb trail. The last item is the current page (`aria-current="page"`). Intermediate items
 * are links when they have an `href`.
 */
export function Breadcrumbs({ items, renderLink, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-small">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight aria-hidden className="size-3.5 text-ink-muted" />}
              {last || !item.href ? (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(last ? "font-medium text-ink" : "text-ink-muted")}
                >
                  {item.label}
                </span>
              ) : renderLink ? (
                renderLink(item, LINK_CLASS)
              ) : (
                <a href={item.href} className={LINK_CLASS}>
                  {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
