/**
 * AccordIQ design tokens as TypeScript constants.
 *
 * `styles.css` is the source of truth for the UI (Tailwind @theme). This file mirrors the color
 * values for code that cannot read CSS variables (favicon/OG image generation, web manifest,
 * contrast tests). `tokens.test.ts` fails if the two drift apart.
 */
export const colors = {
  // Brand palette (provided by the brand brief)
  navy: "#142C4E",
  primary: "#4169E1",
  primarySoft: "#EAF1FF",
  background: "#F7F9FC",
  surface: "#FFFFFF",
  ink: "#172033",
  inkMuted: "#687386",
  line: "#E3E8F0",
  success: "#16845B",
  warning: "#B7791F",
  error: "#C43D4B",

  // Derived shades. Added so that every text/background pairing meets WCAG AA (4.5:1) and
  // interactive control borders meet the 3:1 non-text contrast requirement.
  primaryHover: "#3558C8",
  primaryStrong: "#2A47A8",
  lineStrong: "#8590A2",
  successSoft: "#E7F5EF",
  successStrong: "#0F6445",
  warningSoft: "#FBF3E4",
  warningStrong: "#7A4F0C",
  errorSoft: "#FBECEE",
  errorStrong: "#9B2B38",
} as const;

export type ColorToken = keyof typeof colors;

export const brandAssets = {
  /** Geometry of the AccordIQ mark on a 32x32 grid: three connected nodes forming an "A". */
  mark: {
    viewBox: 32,
    tileRadius: 8,
    apex: { x: 16, y: 8 },
    baseLeft: { x: 9, y: 26 },
    baseRight: { x: 23, y: 26 },
    crossbar: { x1: 11.7, x2: 20.3, y: 19 },
  },
} as const;
