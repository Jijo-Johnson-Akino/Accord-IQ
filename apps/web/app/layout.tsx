import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { BRAND, loadConfig } from "@accordiq/core";
import { ToastProvider } from "@accordiq/ui";
import { colors } from "@accordiq/ui/tokens";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const TITLE = `${BRAND.name} — Contract Intelligence & Lifecycle Management`;

export const metadata: Metadata = {
  metadataBase: new URL(loadConfig().APP_URL),
  applicationName: BRAND.name,
  title: { default: TITLE, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  keywords: [
    "contract lifecycle management",
    "contract intelligence",
    "AI contract review",
    "obligation tracking",
    "contract risk",
  ],
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: colors.navy,
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only rounded-md bg-navy px-4 py-2 text-small font-medium text-surface focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
