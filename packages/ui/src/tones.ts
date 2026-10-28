import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

export type Tone = "info" | "success" | "warning" | "error";

interface ToneStyle {
  /** Container classes: soft background plus a subtle border. */
  container: string;
  /** Icon color (uses the "strong" shade so it reads on the soft background). */
  icon: string;
  Icon: LucideIcon;
}

// Class names are written out in full so Tailwind can detect them.
export const TONE_STYLES: Record<Tone, ToneStyle> = {
  info: {
    container: "border-primary/30 bg-primary-soft",
    icon: "text-primary-strong",
    Icon: Info,
  },
  success: {
    container: "border-success/30 bg-success-soft",
    icon: "text-success-strong",
    Icon: CircleCheck,
  },
  warning: {
    container: "border-warning/40 bg-warning-soft",
    icon: "text-warning-strong",
    Icon: TriangleAlert,
  },
  error: {
    container: "border-error/30 bg-error-soft",
    icon: "text-error-strong",
    Icon: CircleAlert,
  },
};
