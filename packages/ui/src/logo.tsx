import type { SVGProps } from "react";
import { cn } from "./cn";
import { brandAssets, colors } from "./tokens";

export type LogoTone = "default" | "reversed";

export interface LogoMarkProps extends Omit<SVGProps<SVGSVGElement>, "title"> {
  /** "default" is a navy tile; "reversed" is a white tile for use on dark backgrounds. */
  tone?: LogoTone;
  /** Accessible name. Ignored when `decorative` is true. */
  title?: string;
  /** Hide from assistive tech (use when the wordmark text is shown next to the mark). */
  decorative?: boolean;
}

/**
 * The AccordIQ mark: three connected nodes forming an "A", set on a rounded tile. The apex node
 * and the two base nodes are the parties and the commitment they share; the crossbar is the
 * agreement that connects them.
 */
export function LogoMark({
  tone = "default",
  title = "AccordIQ",
  decorative = false,
  className,
  ...props
}: LogoMarkProps) {
  const { apex, baseLeft, baseRight, crossbar, tileRadius, viewBox } = brandAssets.mark;
  const reversed = tone === "reversed";
  const tile = reversed ? colors.surface : colors.navy;
  const stroke = reversed ? colors.navy : colors.surface;
  const nodeFill = reversed ? colors.navy : colors.surface;

  return (
    <svg
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      fill="none"
      className={cn("size-8 shrink-0", className)}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": title })}
      {...props}
    >
      <rect width={viewBox} height={viewBox} rx={tileRadius} fill={tile} />
      <path
        d={`M${apex.x} ${apex.y}L${baseLeft.x} ${baseLeft.y}M${apex.x} ${apex.y}L${baseRight.x} ${baseRight.y}`}
        stroke={stroke}
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d={`M${crossbar.x1} ${crossbar.y}H${crossbar.x2}`}
        stroke={colors.primary}
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      {[apex, baseLeft, baseRight].map((node) => (
        <g key={`${node.x}-${node.y}`}>
          <circle cx={node.x} cy={node.y} r="3" fill={nodeFill} />
          <circle cx={node.x} cy={node.y} r="1.35" fill={colors.primary} />
        </g>
      ))}
    </svg>
  );
}

export interface WordmarkProps {
  tone?: LogoTone;
  className?: string;
}

/** Mark + "AccordIQ" wordmark. The text is real text, so the accessible name is "AccordIQ". */
export function Wordmark({ tone = "default", className }: WordmarkProps) {
  const reversed = tone === "reversed";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} decorative />
      <span
        className={cn(
          "text-xl leading-none font-semibold tracking-tight",
          reversed ? "text-surface" : "text-navy",
        )}
      >
        Accord<span className={reversed ? "text-primary-soft" : "text-primary"}>IQ</span>
      </span>
    </span>
  );
}
