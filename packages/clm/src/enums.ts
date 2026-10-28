export const VENDOR_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const CONTRACT_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "NEGOTIATION",
  "PENDING_APPROVAL",
  "APPROVED",
  "PENDING_SIGNATURE",
  "SIGNED",
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const VERSION_STATUSES = ["DRAFT", "FINAL"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

/** Document processing — not the contract business lifecycle. */
export const DOCUMENT_STATUSES = [
  "UPLOADING",
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const CONTRACT_CATEGORIES = [
  "MSA",
  "NDA",
  "SOW",
  "AMENDMENT",
  "RENEWAL",
  "LICENSE",
  "DPA",
  "OTHER",
] as const;
export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];

export const CONTRACT_DEPARTMENTS = [
  "LEGAL",
  "FINANCE",
  "PROCUREMENT",
  "OPERATIONS",
  "OTHER",
] as const;
export type ContractDepartment = (typeof CONTRACT_DEPARTMENTS)[number];

export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const RELATION_TYPES = ["AMENDMENT", "RENEWAL", "RELATED", "SUPERSEDES"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const PARTY_ROLES = ["INTERNAL", "COUNTERPARTY", "SIGNATORY", "OTHER"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RISK_RULE_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type RiskRuleStatus = (typeof RISK_RULE_STATUSES)[number];

export const RISK_ASSESSMENT_STATUSES = ["DRAFT", "COMPLETE"] as const;
export type RiskAssessmentStatus = (typeof RISK_ASSESSMENT_STATUSES)[number];

export const TEMPLATE_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const APPROVAL_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "CANCELLED",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const STAGE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SKIPPED",
  "CHANGES_REQUESTED",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const DECISIONS = ["APPROVED", "REJECTED", "CHANGES_REQUESTED"] as const;
export type Decision = (typeof DECISIONS)[number];

export const APPROVAL_EVENT_ACTIONS = [
  "START",
  "DECIDE",
  "COMMENT",
  "DELEGATE",
  "RESUBMIT",
  "INVALIDATE",
  "SKIP",
  "ESCALATE",
  "REMIND",
] as const;
export type ApprovalEventAction = (typeof APPROVAL_EVENT_ACTIONS)[number];

export const OBLIGATION_STATUSES = ["OPEN", "DONE", "OVERDUE", "CANCELLED"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export const OBLIGATION_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type ObligationPriority = (typeof OBLIGATION_PRIORITIES)[number];

export const OBLIGATION_FREQUENCIES = ["ONCE", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type ObligationFrequency = (typeof OBLIGATION_FREQUENCIES)[number];

export const OBLIGATION_EVENT_ACTIONS = [
  "CREATE",
  "ASSIGN",
  "COMPLETE",
  "CANCEL",
  "REMIND",
  "ESCALATE",
  "OVERDUE",
  "OCCURRENCE",
] as const;
export type ObligationEventAction = (typeof OBLIGATION_EVENT_ACTIONS)[number];

export const RENEWAL_WATCH_STATUSES = [
  "WATCHING",
  "NOTICE_DUE",
  "DECISION_PENDING",
  "RENEWED",
  "TERMINATED",
  "LAPSED",
  "CANCELLED",
] as const;
export type RenewalWatchStatus = (typeof RENEWAL_WATCH_STATUSES)[number];

export const RENEWAL_DECISIONS = ["RENEW", "TERMINATE"] as const;
export type RenewalDecision = (typeof RENEWAL_DECISIONS)[number];

export const NOTIFICATION_STATUSES = ["UNREAD", "READ"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** AI extraction run — not document processing and not the contract lifecycle. */
export const EXTRACTION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "UNAVAILABLE",
] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const VERIFICATION_STATUSES = ["SUGGESTED", "VERIFIED", "CORRECTED", "REJECTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Deterministic risk categories. Not a regulatory taxonomy. */
export const RISK_CATEGORIES = [
  "DATA_PROTECTION",
  "LIABILITY",
  "INDEMNIFICATION",
  "CONFIDENTIALITY",
  "GOVERNING_LAW",
  "DISPUTE_RESOLUTION",
  "FORCE_MAJEURE",
  "COMPLIANCE",
  "AUTO_RENEWAL",
  "EXPIRY_URGENCY",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const FINDING_REVIEW_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export type FindingReviewStatus = (typeof FINDING_REVIEW_STATUSES)[number];

export const CLAUSE_CATEGORIES = [
  ...RISK_CATEGORIES,
  "PAYMENT",
  "TERM",
  "IP",
  "TERMINATION",
  "OTHER",
] as const;
export type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number];

export const CLAUSE_TEMPLATE_STATUSES = ["DRAFT", "APPROVED", "DEPRECATED"] as const;
export type ClauseTemplateStatus = (typeof CLAUSE_TEMPLATE_STATUSES)[number];

export const CLAUSE_VERSION_STATUSES = ["DRAFT", "APPROVED", "SUPERSEDED"] as const;
export type ClauseVersionStatus = (typeof CLAUSE_VERSION_STATUSES)[number];

export const ENVELOPE_STATUSES = [
  "SENT",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "FAILED",
  "CANCELLED",
] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

export const SIGNER_STATUSES = [
  "PENDING",
  "SENT",
  "VIEWED",
  "SIGNED",
  "DECLINED",
  "EXPIRED",
] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export const SIGNATURE_EVENT_TYPES = [
  "envelope.sent",
  "signer.viewed",
  "signer.signed",
  "signer.declined",
  "envelope.expired",
  "envelope.completed",
  "envelope.failed",
] as const;
export type SignatureEventType = (typeof SIGNATURE_EVENT_TYPES)[number];

export const MILESTONE_STATUSES = ["PLANNED", "DUE", "PAID", "WAIVED", "CANCELLED"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const FINANCIAL_SOURCES = ["CONTRACT_STATED", "IMPORTED"] as const;
export type FinancialSource = (typeof FINANCIAL_SOURCES)[number];

export const ESCALATION_SOURCES = ["CONTRACT_CLAUSE", "ESTIMATE"] as const;
export type EscalationSource = (typeof ESCALATION_SOURCES)[number];

export const SAVINGS_STATUSES = ["ESTIMATE", "VERIFIED", "DISMISSED"] as const;
export type SavingsStatus = (typeof SAVINGS_STATUSES)[number];

export const SAVINGS_KINDS = [
  "PRICE_REDUCTION",
  "VOLUME",
  "TERM",
  "AUTO_RENEW_REVIEW",
  "OTHER",
] as const;
export type SavingsKind = (typeof SAVINGS_KINDS)[number];

export const FINANCE_STATUS_GROUPS = ["all", "committed", "pipeline", "closed"] as const;
export type FinanceStatusGroup = (typeof FINANCE_STATUS_GROUPS)[number];

export const FINANCE_EXPORT_KINDS = ["insights", "transactions"] as const;
export type FinanceExportKind = (typeof FINANCE_EXPORT_KINDS)[number];

/** Keep in sync with packages/ai/src/assistant-intent.ts. Not imported from ai (client-safe). */
export const ASSISTANT_INTENTS = [
  "ASK_CONTRACT",
  "SEARCH_CONTRACTS",
  "COMPARE_TERMS",
  "UPCOMING_COMMITMENTS",
  "DRAFT_FROM_TEMPLATE",
  "EXPLAIN_POLICY",
  "NEGOTIATION_LANGUAGE",
  "SUMMARIZE_CHANGES",
  "AMBIGUOUS",
  "UNSUPPORTED",
  "INJECTION",
] as const;
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

export const ASSISTANT_MESSAGE_ROLES = ["USER", "ASSISTANT"] as const;
export type AssistantMessageRole = (typeof ASSISTANT_MESSAGE_ROLES)[number];

export const ASSISTANT_MESSAGE_STATUSES = [
  "COMPLETED",
  "REFUSED",
  "UNAVAILABLE",
  "FAILED",
] as const;
export type AssistantMessageStatus = (typeof ASSISTANT_MESSAGE_STATUSES)[number];

export const ASSISTANT_PROPOSAL_KINDS = ["DRAFT_CONTRACT"] as const;
export type AssistantProposalKind = (typeof ASSISTANT_PROPOSAL_KINDS)[number];

export const ASSISTANT_PROPOSAL_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "REJECTED",
] as const;
export type AssistantProposalStatus = (typeof ASSISTANT_PROPOSAL_STATUSES)[number];

export const ASSISTANT_SOURCE_KINDS = [
  "DOCUMENT",
  "CONTRACT_RECORD",
  "CLAUSE_PLAYBOOK",
  "OBLIGATION",
] as const;
export type AssistantSourceKind = (typeof ASSISTANT_SOURCE_KINDS)[number];

export const NOTIFICATION_KINDS = [
  "GENERAL",
  "APPROVAL_REMINDER",
  "APPROVAL_UPDATE",
  "SIGNING_UPDATE",
  "OBLIGATION_REMINDER",
  "OBLIGATION_ESCALATION",
  "RENEWAL_ALERT",
  "ESCALATION",
  "INTEGRATION",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_DELIVERY_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

/** Keep in sync with packages/integrations/src/kinds.ts. Not imported (client-safe). */
export const INTEGRATION_KINDS = ["EMAIL", "ESIGN", "STORAGE", "CRM", "ERP"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const EXTRACTION_FIELD_KEYS = [
  "TITLE",
  "START_DATE",
  "END_DATE",
  "RENEWAL_TERMS",
  "GOVERNING_LAW",
  "JURISDICTION",
  "VALUE",
  "CURRENCY",
  "PAYMENT_TERMS",
  "SUMMARY",
] as const;
export type ExtractionFieldKey = (typeof EXTRACTION_FIELD_KEYS)[number];
