import { isoDateSchema } from "@accordiq/core";
import { ORG_ROLES } from "@accordiq/auth";
import { z } from "zod";
import {
  CLAUSE_CATEGORIES,
  CONTRACT_CATEGORIES,
  CONTRACT_DEPARTMENTS,
  CURRENCIES,
  DECISIONS,
  ESCALATION_SOURCES,
  FINANCIAL_SOURCES,
  FINANCE_EXPORT_KINDS,
  MILESTONE_STATUSES,
  SAVINGS_KINDS,
  FINDING_REVIEW_STATUSES,
  INTEGRATION_KINDS,
  NOTIFICATION_KINDS,
  OBLIGATION_FREQUENCIES,
  OBLIGATION_PRIORITIES,
  PARTY_ROLES,
  RELATION_TYPES,
  RENEWAL_DECISIONS,
  RISK_CATEGORIES,
  RISK_RULE_STATUSES,
  SEVERITIES,
  VENDOR_STATUSES,
  VERIFICATION_STATUSES,
  VERSION_STATUSES,
} from "./enums";
import { stageConditionSchema } from "./approval-engine";
import { riskPredicateSchema } from "./risk-engine";
export { updateRiskPolicySchema } from "./risk-engine";

const optionalDate = isoDateSchema.optional();
const optionalText = z.string().trim().max(2000).optional();

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().url().max(500).optional(),
  status: z.enum(VENDOR_STATUSES).optional(),
});

const optionalMinor = z.number().int().nonnegative().max(99_999_999_999).optional();
const nullableMinor = z.number().int().nonnegative().max(99_999_999_999).nullable().optional();

export const createContractSchema = z.object({
  title: z.string().trim().min(1).max(300),
  vendorId: z.string().trim().min(1).optional(),
  effectiveOn: optionalDate,
  expiresOn: optionalDate,
  category: z.enum(CONTRACT_CATEGORIES).optional(),
  currency: z.enum(CURRENCIES).optional(),
  value: z.string().trim().min(1).max(20).optional(),
  valueMinor: optionalMinor,
  department: z.enum(CONTRACT_DEPARTMENTS).optional(),
});

export const updateContractSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  vendorId: z.string().trim().min(1).nullable().optional(),
  effectiveOn: isoDateSchema.nullable().optional(),
  expiresOn: isoDateSchema.nullable().optional(),
  category: z.enum(CONTRACT_CATEGORIES).nullable().optional(),
  currency: z.enum(CURRENCIES).nullable().optional(),
  value: z.string().trim().max(20).nullable().optional(),
  valueMinor: nullableMinor,
  department: z.enum(CONTRACT_DEPARTMENTS).nullable().optional(),
  noticeDays: z.number().int().min(0).max(365).nullable().optional(),
  autoRenew: z.boolean().optional(),
});

export const addRelationSchema = z.object({
  toContractId: z.string().trim().min(1),
  relationType: z.enum(RELATION_TYPES),
});

export const createVersionSchema = z.object({
  summary: optionalText,
  status: z.enum(VERSION_STATUSES).optional(),
});

export const addPartySchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.enum(PARTY_ROLES),
  email: z.string().trim().email().optional(),
  vendorId: z.string().trim().min(1).optional(),
});

export const registerDocumentSchema = z.object({
  fileName: z.string().trim().min(1).max(260),
  contentType: z.string().trim().min(1).max(200),
  byteSize: z
    .number()
    .int()
    .nonnegative()
    .max(1024 * 1024 * 1024),
  versionId: z.string().trim().min(1).optional(),
});

export const createObligationSchema = z.object({
  contractId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300),
  description: optionalText,
  dueOn: optionalDate,
  ownerUserId: z.string().trim().min(1).optional(),
  clauseUsageId: z.string().trim().min(1).optional(),
  sourceQuote: z.string().trim().max(2000).optional(),
  frequency: z.enum(OBLIGATION_FREQUENCIES).optional(),
  intervalCount: z.number().int().min(1).max(24).optional(),
  priority: z.enum(OBLIGATION_PRIORITIES).optional(),
  reminderDaysBefore: z.number().int().min(0).max(365).optional(),
  escalateDaysAfter: z.number().int().min(0).max(365).optional(),
});

export const updateObligationSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  dueOn: isoDateSchema.nullable().optional(),
  ownerUserId: z.string().trim().min(1).nullable().optional(),
  clauseUsageId: z.string().trim().min(1).nullable().optional(),
  sourceQuote: z.string().trim().max(2000).nullable().optional(),
  frequency: z.enum(OBLIGATION_FREQUENCIES).optional(),
  intervalCount: z.number().int().min(1).max(24).optional(),
  priority: z.enum(OBLIGATION_PRIORITIES).optional(),
  reminderDaysBefore: z.number().int().min(0).max(365).optional(),
  escalateDaysAfter: z.number().int().min(0).max(365).optional(),
});

export const completeObligationSchema = z.object({
  completionNote: z.string().trim().max(2000).optional(),
  evidenceDocumentId: z.string().trim().min(1).optional(),
});

export const assignObligationSchema = z.object({
  ownerUserId: z.string().trim().min(1),
});

export const recordRenewalDecisionSchema = z.object({
  decision: z.enum(RENEWAL_DECISIONS),
  note: optionalText,
  proposedExpiresOn: isoDateSchema.optional(),
  templateId: z.string().trim().min(1).optional(),
});

export const applyRenewalDecisionSchema = z.object({
  proposedExpiresOn: isoDateSchema.optional(),
});

export const organizationTimezoneSchema = z.object({
  timezone: z.string().trim().min(1).max(80),
});

export const calendarRangeSchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const createRiskRuleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use an uppercase code like TERM_LENGTH."),
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  severity: z.enum(SEVERITIES),
  status: z.enum(RISK_RULE_STATUSES).optional(),
  category: z.enum(RISK_CATEGORIES),
  predicate: riskPredicateSchema,
  weight: z.number().int().min(1).max(100),
  remediation: z.string().trim().min(1).max(2000),
  explanationTemplate: z.string().trim().min(1).max(2000),
});

export const updateRiskRuleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: optionalText,
  severity: z.enum(SEVERITIES).optional(),
  status: z.enum(RISK_RULE_STATUSES).optional(),
  category: z.enum(RISK_CATEGORIES).optional(),
  predicate: riskPredicateSchema.optional(),
  weight: z.number().int().min(1).max(100).optional(),
  remediation: z.string().trim().min(1).max(2000).optional(),
  explanationTemplate: z.string().trim().min(1).max(2000).optional(),
});

export const assessContractSchema = z.object({
  asOf: isoDateSchema.optional(),
  documentId: z.string().trim().min(1).optional(),
});

const closableFindingStatuses = FINDING_REVIEW_STATUSES.filter((status) => status !== "OPEN") as [
  "RESOLVED",
  "DISMISSED",
];

export const reviewFindingSchema = z.object({
  reviewStatus: z.enum(closableFindingStatuses),
  reviewNote: z.string().trim().min(1).max(2000),
});

export const createClauseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use an uppercase code like CONFIDENTIALITY."),
  title: z.string().trim().min(1).max(200),
  category: z.enum(CLAUSE_CATEGORIES),
  jurisdiction: z.string().trim().min(1).max(120).optional(),
  contractTypes: z.array(z.enum(CONTRACT_CATEGORIES)).max(8).optional(),
  body: z.string().trim().min(1).max(20_000),
  changeSummary: optionalText,
});

export const updateClauseSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.enum(CLAUSE_CATEGORIES).optional(),
  jurisdiction: z.string().trim().min(1).max(120).nullable().optional(),
  contractTypes: z.array(z.enum(CONTRACT_CATEGORIES)).max(8).nullable().optional(),
});

export const createClauseVersionSchema = z.object({
  body: z.string().trim().min(1).max(20_000),
  changeSummary: optionalText,
});

export const addClauseAlternativeSchema = z.object({
  alternativeTemplateId: z.string().trim().min(1),
  note: optionalText,
});

export const addClauseUsageSchema = z.object({
  contractId: z.string().trim().min(1),
  versionId: z.string().trim().min(1).optional(),
});

export const workflowStageInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  requiredRole: z.enum(ORG_ROLES),
  step: z.number().int().min(1).max(20).optional(),
  condition: stageConditionSchema.optional(),
  dueInDays: z.number().int().min(1).max(365).optional(),
  reminderHoursBefore: z.number().int().min(1).max(336).optional(),
  escalateToRole: z.enum(ORG_ROLES).optional(),
  allowDelegate: z.boolean().optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  stages: z.array(workflowStageInputSchema).min(1).max(12),
});

export const startApprovalSchema = z.object({
  templateId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

export const decideApprovalSchema = z.object({
  stageId: z.string().trim().min(1).optional(),
  decision: z.enum(DECISIONS),
  comment: optionalText,
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

export const commentApprovalSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  stageId: z.string().trim().min(1).optional(),
});

export const delegateApprovalSchema = z.object({
  toUserId: z.string().trim().min(1),
});

export const resubmitApprovalSchema = z.object({
  comment: optionalText,
});

export const startExtractionSchema = z.object({
  documentId: z.string().trim().min(1).optional(),
});

export const correctExtractedFieldSchema = z.object({
  verification: z.enum(VERIFICATION_STATUSES),
  correctedValue: z.string().trim().max(2000).nullable().optional(),
});

export const applyExtractionSchema = z.object({
  includeParties: z.boolean().optional(),
  includeObligations: z.boolean().optional(),
});

export const askQuestionSchema = z.object({
  question: z.string().trim().min(3).max(500),
  documentId: z.string().trim().min(1).optional(),
});

export const compareDocumentsSchema = z.object({
  leftDocumentId: z.string().trim().min(1),
  rightDocumentId: z.string().trim().min(1),
});

export const sendEnvelopeSchema = z.object({
  documentId: z.string().trim().min(1).optional(),
  message: z.string().trim().max(2000).optional(),
  signers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().email().max(320),
        routingOrder: z.number().int().min(1).max(20),
        partyId: z.string().trim().min(1).optional(),
        required: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(20),
});

const financeAmount = z.object({
  amount: z.string().trim().min(1).max(20).optional(),
  amountMinor: optionalMinor,
  currency: z.enum(CURRENCIES).optional(),
});

export const createPaymentMilestoneSchema = financeAmount.extend({
  contractId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  dueOn: optionalDate,
  paidOn: optionalDate,
  status: z.enum(MILESTONE_STATUSES).optional(),
  source: z.enum(FINANCIAL_SOURCES),
  note: optionalText,
});

export const createFinancialTransactionSchema = financeAmount.extend({
  contractId: z.string().trim().min(1).optional(),
  vendorId: z.string().trim().min(1).optional(),
  currency: z.enum(CURRENCIES),
  occurredOn: isoDateSchema,
  reference: z.string().trim().max(120).optional(),
  note: optionalText,
});

export const createPriceEscalationSchema = z.object({
  contractId: z.string().trim().min(1),
  percentBps: z.number().int().min(0).max(100_000),
  effectiveOn: optionalDate,
  source: z.enum(ESCALATION_SOURCES),
  note: optionalText,
});

export const createSavingsOpportunitySchema = financeAmount.extend({
  contractId: z.string().trim().min(1).optional(),
  vendorId: z.string().trim().min(1).optional(),
  kind: z.enum(SAVINGS_KINDS),
  title: z.string().trim().min(1).max(200),
  explanation: z.string().trim().min(1).max(2000),
});

export const financeExportSchema = z.object({
  kind: z.enum(FINANCE_EXPORT_KINDS),
});

export const sendAssistantMessageSchema = z.object({
  threadId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).max(2000),
  contractId: z.string().trim().min(1).optional(),
  leftContractId: z.string().trim().min(1).optional(),
  rightContractId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
  /** Ignored. Tenant scope is the session organization. */
  organizationId: z.unknown().optional(),
});

export const notificationPreferenceItemSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  inApp: z.boolean(),
  email: z.boolean(),
});

export const updateNotificationPreferencesSchema = z.object({
  preferences: z.array(notificationPreferenceItemSchema).min(1).max(NOTIFICATION_KINDS.length),
  /** Ignored. Tenant scope is the session organization. */
  organizationId: z.unknown().optional(),
});

export const saveIntegrationCredentialsSchema = z.object({
  kind: z.enum(INTEGRATION_KINDS),
  provider: z.string().trim().min(1).max(40),
  apiKey: z.string().min(8).max(500),
  webhookSecret: z.string().min(16).max(500).optional(),
  /** Ignored. Tenant scope is the session organization. */
  organizationId: z.unknown().optional(),
});

export const disconnectIntegrationSchema = z.object({
  kind: z.enum(INTEGRATION_KINDS),
  /** Ignored. Tenant scope is the session organization. */
  organizationId: z.unknown().optional(),
});
