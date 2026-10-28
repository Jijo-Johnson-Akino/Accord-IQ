import { ImageResponse } from "next/og";
import { brandAssets, colors } from "@accordiq/ui/tokens";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon. Full-bleed navy square (iOS applies its own rounded mask). */
export default function AppleIcon() {
  const { apex, baseLeft, baseRight, crossbar, viewBox } = brandAssets.mark;
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: colors.navy }}>
      <svg width="180" height="180" viewBox={`0 0 ${viewBox} ${viewBox}`} fill="none">
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
    </div>,
    size,
  );
}
