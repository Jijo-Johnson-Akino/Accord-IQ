import { ImageResponse } from "next/og";
import { BRAND } from "@accordiq/core";
import { brandAssets, colors } from "@accordiq/ui/tokens";

export const alt = "AccordIQ — Every contract. Every commitment. Under control.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card (also used for Twitter/X via twitter-image.tsx). */
export default function OpenGraphImage() {
  const { apex, baseLeft, baseRight, crossbar, viewBox, tileRadius } = brandAssets.mark;
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 80,
        background: colors.background,
        color: colors.ink,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <svg width="88" height="88" viewBox={`0 0 ${viewBox} ${viewBox}`} fill="none">
          <rect width={viewBox} height={viewBox} rx={tileRadius} fill={colors.navy} />
          <path
            d={`M${apex.x} ${apex.y}L${baseLeft.x} ${baseLeft.y}M${apex.x} ${apex.y}L${baseRight.x} ${baseRight.y}`}
            stroke={colors.surface}
            strokeWidth="2.25"
            strokeLinecap="round"
          />
          <path
            d={`M${crossbar.x1} ${crossbar.y}H${crossbar.x2}`}
            stroke={colors.primary}
            strokeWidth="2.25"
            strokeLinecap="round"
          />
          {[apex, baseLeft, baseRight].map((n) => (
            <g key={`${n.x}-${n.y}`}>
              <circle cx={n.x} cy={n.y} r="3" fill={colors.surface} />
              <circle cx={n.x} cy={n.y} r="1.35" fill={colors.primary} />
            </g>
          ))}
        </svg>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: colors.navy }}>
          Accord<span style={{ color: colors.primary }}>IQ</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: -2,
            color: colors.navy,
          }}
        >
          {BRAND.tagline}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: colors.inkMuted }}>
          {BRAND.category}
        </div>
      </div>
    </div>,
    size,
  );
}
