export const INTEGRATION_KINDS = ["EMAIL", "ESIGN", "STORAGE", "CRM", "ERP"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

/** Org-stored secrets are accepted only for adapters that are not environment-configured. */
export const STOREABLE_INTEGRATION_KINDS = ["CRM", "ERP"] as const;
export type StoreableIntegrationKind = (typeof STOREABLE_INTEGRATION_KINDS)[number];

export const INTEGRATION_CONNECTION_STATUSES = ["STORED", "REVOKED"] as const;
export type IntegrationConnectionStatus = (typeof INTEGRATION_CONNECTION_STATUSES)[number];

export const INTEGRATION_RUN_STATUSES = ["SUCCESS", "FAILED", "SKIPPED"] as const;
export type IntegrationRunStatus = (typeof INTEGRATION_RUN_STATUSES)[number];

export const INTEGRATION_STATES = [
  "NOT_CONFIGURED",
  "TEST_ONLY",
  "CONNECTED",
  "UNAVAILABLE",
] as const;
export type IntegrationState = (typeof INTEGRATION_STATES)[number];

export function isIntegrationKind(value: string): value is IntegrationKind {
  return (INTEGRATION_KINDS as readonly string[]).includes(value);
}

export function isStoreableKind(value: string): value is StoreableIntegrationKind {
  return (STOREABLE_INTEGRATION_KINDS as readonly string[]).includes(value);
}

export function integrationKindFromPath(value: string): IntegrationKind | null {
  const upper = value.trim().toUpperCase();
  return isIntegrationKind(upper) ? upper : null;
}
