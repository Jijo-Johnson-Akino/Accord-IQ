import type { IntegrationKind, IntegrationState } from "./kinds";

export interface IntegrationCard {
  kind: IntegrationKind;
  title: string;
  description: string;
  state: IntegrationState;
  /** True only when the adapter can actually run. */
  available: boolean;
  /** True only for a live, configured provider. Never true for unwired CRM/ERP. */
  connected: boolean;
  testOnly: boolean;
  provider: string;
  setup: string[];
  credentialConfigured: boolean;
  warning: string | null;
  webhookPath: string | null;
}

export interface EmailCatalogInput {
  driver: "console" | "resend";
}

export interface EsignCatalogInput {
  provider: string;
  available: boolean;
  testOnly: boolean;
  setup: string[];
}

export interface StorageCatalogInput {
  driver: "local" | "s3";
}

export function emailCatalog(input: EmailCatalogInput): IntegrationCard {
  const setup = [
    "Copy .env.example to .env.local (or apps/web/.env.local).",
    "Set EMAIL_DRIVER=resend, RESEND_API_KEY, and EMAIL_FROM.",
    "Production refuses EMAIL_DRIVER=console. Credentials stay server-side.",
  ];
  if (input.driver === "resend") {
    return {
      kind: "EMAIL",
      title: "Email",
      description: "Transactional mail for reminders, signing updates, and escalations.",
      state: "CONNECTED",
      available: true,
      connected: true,
      testOnly: false,
      provider: "resend",
      setup,
      credentialConfigured: true,
      warning: null,
      webhookPath: null,
    };
  }
  return {
    kind: "EMAIL",
    title: "Email",
    description: "Transactional mail for reminders, signing updates, and escalations.",
    state: "TEST_ONLY",
    available: true,
    connected: false,
    testOnly: true,
    provider: "console",
    setup,
    credentialConfigured: false,
    warning:
      "The console driver writes to .data/mail-outbox.jsonl. It is not a live email provider and is refused in production.",
    webhookPath: null,
  };
}

export function esignCatalog(input: EsignCatalogInput): IntegrationCard {
  const connected = input.available && !input.testOnly;
  const state: IntegrationState = !input.available
    ? "NOT_CONFIGURED"
    : input.testOnly
      ? "TEST_ONLY"
      : "CONNECTED";
  return {
    kind: "ESIGN",
    title: "E-signature",
    description: "Send approved versions for signature. The browser cannot mark a contract signed.",
    state,
    available: input.available,
    connected,
    testOnly: input.testOnly,
    provider: input.provider,
    setup: input.setup,
    credentialConfigured: input.available,
    warning: input.testOnly
      ? "Sandbox signing is for local tests. It does not email signers and is not legally binding."
      : null,
    webhookPath: "/api/webhooks/esign",
  };
}

export function storageCatalog(input: StorageCatalogInput): IntegrationCard {
  const setup = [
    "Local files are stored under STORAGE_LOCAL_DIR (default .data/uploads).",
    "S3 is not wired. Do not set STORAGE_DRIVER=s3 — the process will refuse to start.",
    "Cloud storage adapters will land in a later phase.",
  ];
  if (input.driver === "s3") {
    return {
      kind: "STORAGE",
      title: "Cloud storage",
      description: "Private contract files. Downloads go through an authorized handler.",
      state: "NOT_CONFIGURED",
      available: false,
      connected: false,
      testOnly: false,
      provider: "s3",
      setup,
      credentialConfigured: false,
      warning: "S3 storage is not wired in this environment.",
      webhookPath: null,
    };
  }
  return {
    kind: "STORAGE",
    title: "Cloud storage",
    description: "Private contract files. Downloads go through an authorized handler.",
    state: "TEST_ONLY",
    available: true,
    connected: false,
    testOnly: true,
    provider: "local",
    setup,
    credentialConfigured: false,
    warning: "Files are on the local disk. This is not a connected cloud storage integration.",
    webhookPath: null,
  };
}

export function unwiredCatalog(input: {
  kind: "CRM" | "ERP";
  title: string;
  description: string;
  credentialConfigured: boolean;
  provider: string | null;
}): IntegrationCard {
  const setup = [
    "No CRM or ERP adapter is wired yet.",
    "Organization admins may store an API key and webhook secret so the connection record exists.",
    "Stored credentials do not activate the integration. Status stays unavailable until an adapter ships.",
    `Inbound callbacks use POST /api/webhooks/integrations/${input.kind.toLowerCase()} with HMAC headers.`,
  ];
  return {
    kind: input.kind,
    title: input.title,
    description: input.description,
    state: "UNAVAILABLE",
    available: false,
    connected: false,
    testOnly: false,
    provider: input.provider ?? "none",
    setup,
    credentialConfigured: input.credentialConfigured,
    warning: input.credentialConfigured
      ? "Credentials are stored encrypted on the server. No adapter is wired, so this integration is not connected."
      : "Not connected. Save credentials only if you are preparing a future adapter — AccordIQ will not call the provider.",
    webhookPath: `/api/webhooks/integrations/${input.kind.toLowerCase()}`,
  };
}
