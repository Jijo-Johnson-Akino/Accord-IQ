export const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  GENERAL: "General",
  APPROVAL_REMINDER: "Approval reminders",
  APPROVAL_UPDATE: "Approval updates",
  SIGNING_UPDATE: "Signing updates",
  OBLIGATION_REMINDER: "Obligation reminders",
  OBLIGATION_ESCALATION: "Obligation escalations",
  RENEWAL_ALERT: "Renewal alerts",
  ESCALATION: "Escalations",
  INTEGRATION: "Integration events",
};

export function formatUtcStamp(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function integrationStateLabel(card: {
  connected: boolean;
  testOnly: boolean;
  credentialConfigured: boolean;
  available: boolean;
}): { label: string; tone: "success" | "warning" | "neutral" | "info" } {
  if (card.connected) return { label: "Connected", tone: "success" };
  if (card.testOnly) return { label: "Test only", tone: "info" };
  if (card.credentialConfigured)
    return { label: "Credentials stored · not connected", tone: "warning" };
  return { label: "Not configured", tone: "neutral" };
}
