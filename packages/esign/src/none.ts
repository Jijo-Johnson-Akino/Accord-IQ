import { AppError } from "@accordiq/core";
import type { EsignAdapter, EsignStatus } from "./types";

export const NONE_SETUP = [
  "Copy .env.example to .env.local (or apps/web/.env.local).",
  "For local test-only signing, set ESIGN_PROVIDER=sandbox and ESIGN_WEBHOOK_SECRET (16+ characters).",
  "Sandbox is refused in production and is not a legally binding signature.",
  "For Dropbox Sign, set ESIGN_PROVIDER=dropbox_sign, ESIGN_API_KEY, and ESIGN_WEBHOOK_SECRET.",
  "Point Dropbox Sign callbacks at POST /api/webhooks/esign. Credentials stay server-side.",
];

export function noneStatus(): EsignStatus {
  return {
    provider: "none",
    available: false,
    testOnly: false,
    setup: NONE_SETUP,
  };
}

export function createNoneAdapter(): EsignAdapter {
  const status = noneStatus();
  const unavailable = async () => {
    throw new AppError(
      "VALIDATION",
      "E-signature is not connected. Set ESIGN_PROVIDER to sandbox or dropbox_sign.",
    );
  };
  return {
    status: () => status,
    createEnvelope: unavailable,
    cancelEnvelope: unavailable,
    downloadCompletion: unavailable,
  };
}
