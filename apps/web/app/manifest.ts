import type { MetadataRoute } from "next";
import { BRAND } from "@accordiq/core";
import { colors } from "@accordiq/ui/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — ${BRAND.category}`,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: colors.background,
    theme_color: colors.navy,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
