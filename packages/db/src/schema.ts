import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

const optionalTimestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

/** Better Auth user. `platformRole` is SUPERADMIN or null — never an organization role. */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  platformRole: text("platform_role"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Tenant scope for this session. Never taken from a client-supplied identifier. */
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const membership = sqliteTable(
  "membership",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("membership_org_user_idx").on(table.organizationId, table.userId),
    index("membership_user_id_idx").on(table.userId),
  ],
);

/**
 * Generic tenant-owned row from Phase 4 isolation proofs. Contract records live in `contract`.
 */
export const tenantRecord = sqliteTable(
  "tenant_record",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("tenant_record_org_idx").on(table.organizationId)],
);

export const auditEvent = sqliteTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    /** JSON object. Must never contain secrets or document bytes. */
    metadata: text("metadata"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("audit_event_org_idx").on(table.organizationId),
    index("audit_event_entity_idx").on(table.organizationId, table.entityType, table.entityId),
  ],
);

export const vendor = sqliteTable(
  "vendor",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    status: text("status").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("vendor_org_name_idx").on(table.organizationId, table.name),
    index("vendor_org_idx").on(table.organizationId),
  ],
);

export const contract = sqliteTable(
  "contract",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull(),
    vendorId: text("vendor_id").references(() => vendor.id, { onDelete: "set null" }),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Set after the first version insert. No FK: contract ↔ version is circular. */
    currentVersionId: text("current_version_id"),
    effectiveOn: text("effective_on"),
    expiresOn: text("expires_on"),
    category: text("category"),
    currency: text("currency"),
    valueMinor: integer("value_minor"),
    department: text("department"),
    noticeDays: integer("notice_days"),
    autoRenew: integer("auto_renew", { mode: "boolean" }).notNull().default(false),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("contract_org_idx").on(table.organizationId),
    index("contract_org_status_idx").on(table.organizationId, table.status),
    index("contract_vendor_idx").on(table.vendorId),
    index("contract_org_category_idx").on(table.organizationId, table.category),
    index("contract_org_expires_idx").on(table.organizationId, table.expiresOn),
  ],
);

export const contractVersion = sqliteTable(
  "contract_version",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull(),
    summary: text("summary"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("contract_version_number_idx").on(table.contractId, table.versionNumber),
    index("contract_version_org_idx").on(table.organizationId, table.contractId),
  ],
);

export const document = sqliteTable(
  "document",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    versionId: text("version_id").references(() => contractVersion.id, { onDelete: "set null" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storageKey: text("storage_key"),
    status: text("status").notNull(),
    sha256: text("sha256"),
    processingError: text("processing_error"),
    processedAt: optionalTimestamp("processed_at"),
    pageCount: integer("page_count"),
    idempotencyKey: text("idempotency_key"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("document_contract_idx").on(table.organizationId, table.contractId),
    index("document_org_sha256_idx").on(table.organizationId, table.sha256),
    uniqueIndex("document_org_idempotency_idx").on(table.organizationId, table.idempotencyKey),
  ],
);

export const contractRelation = sqliteTable(
  "contract_relation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    fromContractId: text("from_contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    toContractId: text("to_contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("contract_relation_pair_idx").on(
      table.fromContractId,
      table.toContractId,
      table.relationType,
    ),
    index("contract_relation_org_idx").on(table.organizationId, table.fromContractId),
    index("contract_relation_to_idx").on(table.organizationId, table.toContractId),
  ],
);

export const contractParty = sqliteTable(
  "contract_party",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id").references(() => vendor.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("contract_party_contract_idx").on(table.organizationId, table.contractId)],
);

export const riskRule = sqliteTable(
  "risk_rule",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    category: text("category"),
    predicateJson: text("predicate_json"),
    weight: integer("weight").notNull().default(10),
    remediation: text("remediation"),
    explanationTemplate: text("explanation_template"),
    versionNumber: integer("version_number").notNull().default(1),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("risk_rule_org_code_idx").on(table.organizationId, table.code),
    index("risk_rule_org_idx").on(table.organizationId),
  ],
);

export const riskAssessment = sqliteTable(
  "risk_assessment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    versionId: text("version_id").references(() => contractVersion.id, { onDelete: "set null" }),
    overallSeverity: text("overall_severity").notNull(),
    status: text("status").notNull(),
    summary: text("summary"),
    assessmentNumber: integer("assessment_number").notNull().default(1),
    score: integer("score").notNull().default(0),
    scoreMethod: text("score_method").notNull().default("SUM_WEIGHTS_CAPPED_100"),
    policyJson: text("policy_json"),
    ruleSetHash: text("rule_set_hash"),
    stale: integer("stale", { mode: "boolean" }).notNull().default(false),
    engineVersion: text("engine_version"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("risk_assessment_contract_idx").on(table.organizationId, table.contractId)],
);

export const riskPolicy = sqliteTable(
  "risk_policy",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    highMin: integer("high_min").notNull(),
    mediumMin: integer("medium_min").notNull(),
    expiryUrgentDays: integer("expiry_urgent_days").notNull(),
    expiryWarnDays: integer("expiry_warn_days").notNull(),
    autoRenewNoticeDaysMin: integer("auto_renew_notice_days_min").notNull(),
    maxTermDays: integer("max_term_days").notNull(),
    source: text("source").notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [uniqueIndex("risk_policy_org_idx").on(table.organizationId)],
);

export const riskFinding = sqliteTable(
  "risk_finding",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => riskAssessment.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").references(() => riskRule.id, { onDelete: "set null" }),
    ruleCode: text("rule_code").notNull(),
    ruleVersion: integer("rule_version").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    weight: integer("weight").notNull(),
    contractText: text("contract_text"),
    explanation: text("explanation").notNull(),
    aiExplanation: text("ai_explanation"),
    remediation: text("remediation"),
    reviewStatus: text("review_status").notNull(),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id),
    reviewedAt: optionalTimestamp("reviewed_at"),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("risk_finding_assessment_idx").on(table.assessmentId),
    index("risk_finding_contract_idx").on(table.organizationId, table.contractId),
  ],
);

export const clauseTemplate = sqliteTable(
  "clause_template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    jurisdiction: text("jurisdiction"),
    contractTypes: text("contract_types"),
    status: text("status").notNull(),
    currentVersionId: text("current_version_id"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("clause_template_org_code_idx").on(table.organizationId, table.code),
    index("clause_template_org_idx").on(table.organizationId, table.status),
  ],
);

export const clauseVersion = sqliteTable(
  "clause_version",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => clauseTemplate.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    body: text("body").notNull(),
    changeSummary: text("change_summary"),
    status: text("status").notNull(),
    approvedByUserId: text("approved_by_user_id").references(() => user.id),
    approvedAt: optionalTimestamp("approved_at"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("clause_version_number_idx").on(table.templateId, table.versionNumber),
    index("clause_version_template_idx").on(table.organizationId, table.templateId),
  ],
);

export const clauseAlternative = sqliteTable(
  "clause_alternative",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => clauseTemplate.id, { onDelete: "cascade" }),
    alternativeTemplateId: text("alternative_template_id")
      .notNull()
      .references(() => clauseTemplate.id, { onDelete: "cascade" }),
    note: text("note"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("clause_alternative_pair_idx").on(table.templateId, table.alternativeTemplateId),
  ],
);

export const clauseUsage = sqliteTable(
  "clause_usage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => clauseTemplate.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => clauseVersion.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("clause_usage_unique_idx").on(table.templateId, table.contractId),
    index("clause_usage_contract_idx").on(table.organizationId, table.contractId),
  ],
);

export const approvalWorkflowTemplate = sqliteTable(
  "approval_workflow_template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("approval_template_org_idx").on(table.organizationId)],
);

export const approvalStageTemplate = sqliteTable(
  "approval_stage_template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => approvalWorkflowTemplate.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    requiredRole: text("required_role").notNull(),
    step: integer("step").notNull().default(1),
    conditionJson: text("condition_json"),
    dueInDays: integer("due_in_days"),
    reminderHoursBefore: integer("reminder_hours_before"),
    escalateToRole: text("escalate_to_role"),
    allowDelegate: integer("allow_delegate", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("approval_stage_template_pos_idx").on(table.templateId, table.position)],
);

export const approvalRequest = sqliteTable(
  "approval_request",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => approvalWorkflowTemplate.id),
    status: text("status").notNull(),
    snapshotJson: text("snapshot_json"),
    stale: integer("stale", { mode: "boolean" }).notNull().default(false),
    invalidatedReason: text("invalidated_reason"),
    resubmitCount: integer("resubmit_count").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("approval_request_org_idx").on(table.organizationId, table.contractId),
    uniqueIndex("approval_request_org_idempotency_idx").on(
      table.organizationId,
      table.idempotencyKey,
    ),
  ],
);

export const approvalStage = sqliteTable(
  "approval_stage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestId: text("request_id")
      .notNull()
      .references(() => approvalRequest.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    requiredRole: text("required_role").notNull(),
    status: text("status").notNull(),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: optionalTimestamp("decided_at"),
    comment: text("comment"),
    step: integer("step").notNull().default(1),
    conditionJson: text("condition_json"),
    dueAt: optionalTimestamp("due_at"),
    dueInDays: integer("due_in_days"),
    reminderHoursBefore: integer("reminder_hours_before"),
    reminderSentAt: optionalTimestamp("reminder_sent_at"),
    escalateToRole: text("escalate_to_role"),
    escalatedAt: optionalTimestamp("escalated_at"),
    delegatedToUserId: text("delegated_to_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    delegatedByUserId: text("delegated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    delegatedAt: optionalTimestamp("delegated_at"),
    skippedReason: text("skipped_reason"),
    allowDelegate: integer("allow_delegate", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [uniqueIndex("approval_stage_pos_idx").on(table.requestId, table.position)],
);

export const approvalComment = sqliteTable(
  "approval_comment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestId: text("request_id")
      .notNull()
      .references(() => approvalRequest.id, { onDelete: "cascade" }),
    stageId: text("stage_id").references(() => approvalStage.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("approval_comment_request_idx").on(table.organizationId, table.requestId)],
);

export const approvalEvent = sqliteTable(
  "approval_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestId: text("request_id")
      .notNull()
      .references(() => approvalRequest.id, { onDelete: "cascade" }),
    stageId: text("stage_id").references(() => approvalStage.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    payloadJson: text("payload_json"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("approval_event_request_idx").on(table.organizationId, table.requestId),
    uniqueIndex("approval_event_idempotency_idx").on(table.requestId, table.idempotencyKey),
  ],
);

export const obligation = sqliteTable(
  "obligation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueOn: text("due_on"),
    status: text("status").notNull(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    clauseUsageId: text("clause_usage_id").references(() => clauseUsage.id, {
      onDelete: "set null",
    }),
    sourceQuote: text("source_quote"),
    frequency: text("frequency").notNull().default("ONCE"),
    intervalCount: integer("interval_count").notNull().default(1),
    priority: text("priority").notNull().default("MEDIUM"),
    completedAt: optionalTimestamp("completed_at"),
    completedByUserId: text("completed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    completionNote: text("completion_note"),
    evidenceDocumentId: text("evidence_document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    reminderDaysBefore: integer("reminder_days_before").notNull().default(7),
    escalateDaysAfter: integer("escalate_days_after").notNull().default(1),
    parentObligationId: text("parent_obligation_id").references(
      (): AnySQLiteColumn => obligation.id,
      { onDelete: "set null" },
    ),
    occurrenceIndex: integer("occurrence_index").notNull().default(1),
    timezone: text("timezone").notNull().default("UTC"),
    lastRemindedOn: text("last_reminded_on"),
    lastEscalatedOn: text("last_escalated_on"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("obligation_org_idx").on(table.organizationId),
    index("obligation_contract_idx").on(table.organizationId, table.contractId),
    index("obligation_due_idx").on(table.organizationId, table.dueOn),
  ],
);

export const obligationEvent = sqliteTable(
  "obligation_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    obligationId: text("obligation_id")
      .notNull()
      .references(() => obligation.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    dueOn: text("due_on"),
    note: text("note"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("obligation_event_obligation_idx").on(table.organizationId, table.obligationId),
  ],
);

export const renewalWatch = sqliteTable(
  "renewal_watch",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    expiresOn: text("expires_on").notNull(),
    noticeDays: integer("notice_days").notNull(),
    noticeOn: text("notice_on").notNull(),
    terminateBy: text("terminate_by").notNull(),
    autoRenew: integer("auto_renew", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull(),
    decision: text("decision"),
    decisionNote: text("decision_note"),
    decidedAt: optionalTimestamp("decided_at"),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    approvalRequestId: text("approval_request_id").references(() => approvalRequest.id, {
      onDelete: "set null",
    }),
    proposedExpiresOn: text("proposed_expires_on"),
    reminderDaysBefore: integer("reminder_days_before").notNull().default(30),
    escalateDaysAfter: integer("escalate_days_after").notNull().default(0),
    timezone: text("timezone").notNull().default("UTC"),
    lastRemindedOn: text("last_reminded_on"),
    lastEscalatedOn: text("last_escalated_on"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("renewal_watch_contract_idx").on(table.organizationId, table.contractId),
    index("renewal_watch_org_notice_idx").on(table.organizationId, table.noticeOn),
  ],
);

export const renewalEvent = sqliteTable(
  "renewal_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    watchId: text("watch_id")
      .notNull()
      .references(() => renewalWatch.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("renewal_event_watch_idx").on(table.organizationId, table.watchId)],
);

export const reminderReceipt = sqliteTable(
  "reminder_receipt",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    kind: text("kind").notNull(),
    forDate: text("for_date").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("reminder_receipt_dedupe_idx").on(
      table.organizationId,
      table.entityType,
      table.entityId,
      table.kind,
      table.forDate,
    ),
  ],
);

export const paymentMilestone = sqliteTable(
  "payment_milestone",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    dueOn: text("due_on"),
    paidOn: text("paid_on"),
    status: text("status").notNull(),
    source: text("source").notNull(),
    note: text("note"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("payment_milestone_contract_idx").on(table.organizationId, table.contractId)],
);

export const financialTransaction = sqliteTable(
  "financial_transaction",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id").references(() => contract.id, { onDelete: "set null" }),
    vendorId: text("vendor_id").references(() => vendor.id, { onDelete: "set null" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    occurredOn: text("occurred_on").notNull(),
    reference: text("reference"),
    note: text("note"),
    source: text("source").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("financial_transaction_org_idx").on(table.organizationId, table.occurredOn),
    index("financial_transaction_contract_idx").on(table.organizationId, table.contractId),
    index("financial_transaction_vendor_idx").on(table.organizationId, table.vendorId),
  ],
);

export const priceEscalation = sqliteTable(
  "price_escalation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    percentBps: integer("percent_bps").notNull(),
    effectiveOn: text("effective_on"),
    source: text("source").notNull(),
    note: text("note"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("price_escalation_contract_idx").on(table.organizationId, table.contractId)],
);

export const savingsOpportunity = sqliteTable(
  "savings_opportunity",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id").references(() => contract.id, { onDelete: "set null" }),
    vendorId: text("vendor_id").references(() => vendor.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    amountMinor: integer("amount_minor"),
    currency: text("currency"),
    status: text("status").notNull(),
    explanation: text("explanation").notNull(),
    verifiedByUserId: text("verified_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    verifiedAt: optionalTimestamp("verified_at"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("savings_opportunity_org_idx").on(table.organizationId, table.status)],
);

export const notification = sqliteTable(
  "notification",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull(),
    kind: text("kind").notNull().default("GENERAL"),
    href: text("href"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    createdAt: timestamp("created_at"),
    readAt: optionalTimestamp("read_at"),
  },
  (table) => [index("notification_user_idx").on(table.organizationId, table.userId, table.status)],
);

export const notificationPreference = sqliteTable(
  "notification_preference",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    inApp: integer("in_app", { mode: "boolean" }).notNull().default(true),
    email: integer("email", { mode: "boolean" }).notNull().default(true),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("notification_preference_user_kind_idx").on(
      table.organizationId,
      table.userId,
      table.kind,
    ),
  ],
);

export const notificationDelivery = sqliteTable(
  "notification_delivery",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    notificationId: text("notification_id").references(() => notification.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    nextRetryAt: optionalTimestamp("next_retry_at"),
    sentAt: optionalTimestamp("sent_at"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("notification_delivery_retry_idx").on(
      table.organizationId,
      table.status,
      table.nextRetryAt,
    ),
  ],
);

export const integrationConnection = sqliteTable(
  "integration_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    ciphertext: text("ciphertext"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    revokedAt: optionalTimestamp("revoked_at"),
  },
  (table) => [
    uniqueIndex("integration_connection_org_kind_idx").on(table.organizationId, table.kind),
  ],
);

export const integrationWebhookEvent = sqliteTable(
  "integration_webhook_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type"),
    status: text("status").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("integration_webhook_event_idem_idx").on(
      table.organizationId,
      table.kind,
      table.provider,
      table.providerEventId,
    ),
  ],
);

export const integrationRun = sqliteTable(
  "integration_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    action: text("action").notNull(),
    status: text("status").notNull(),
    attempt: integer("attempt").notNull().default(1),
    error: text("error"),
    webhookEventId: text("webhook_event_id").references(() => integrationWebhookEvent.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("integration_run_org_idx").on(table.organizationId, table.createdAt)],
);

export const extractionRun = sqliteTable(
  "extraction_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    versionId: text("version_id").references(() => contractVersion.id, { onDelete: "set null" }),
    status: text("status").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    error: text("error"),
    conflictJson: text("conflict_json"),
    sourceCharCount: integer("source_char_count").notNull().default(0),
    sourceSha256: text("source_sha256"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    startedAt: optionalTimestamp("started_at"),
    finishedAt: optionalTimestamp("finished_at"),
  },
  (table) => [index("extraction_run_contract_idx").on(table.organizationId, table.contractId)],
);

export const extractedField = sqliteTable(
  "extracted_field",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => extractionRun.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    valueText: text("value_text"),
    confidence: integer("confidence"),
    citationQuote: text("citation_quote"),
    citationPage: integer("citation_page"),
    verification: text("verification").notNull(),
    correctedValue: text("corrected_value"),
    correctedByUserId: text("corrected_by_user_id").references(() => user.id),
    correctedAt: optionalTimestamp("corrected_at"),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("extracted_field_run_idx").on(table.runId, table.fieldKey)],
);

export const extractedParty = sqliteTable(
  "extracted_party",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => extractionRun.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    confidence: integer("confidence"),
    citationQuote: text("citation_quote"),
    citationPage: integer("citation_page"),
    verification: text("verification").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("extracted_party_run_idx").on(table.runId)],
);

export const extractedClause = sqliteTable(
  "extracted_clause",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => extractionRun.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    heading: text("heading").notNull(),
    summary: text("summary").notNull(),
    confidence: integer("confidence"),
    citationQuote: text("citation_quote"),
    citationPage: integer("citation_page"),
    verification: text("verification").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("extracted_clause_run_idx").on(table.runId)],
);

export const extractedObligation = sqliteTable(
  "extracted_obligation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => extractionRun.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueOn: text("due_on"),
    confidence: integer("confidence"),
    citationQuote: text("citation_quote"),
    citationPage: integer("citation_page"),
    verification: text("verification").notNull(),
    promotedObligationId: text("promoted_obligation_id").references(() => obligation.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at"),
  },
  (table) => [index("extracted_obligation_run_idx").on(table.runId)],
);

export const contractQuestion = sqliteTable(
  "contract_question",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    supported: integer("supported", { mode: "boolean" }).notNull(),
    refusalReason: text("refusal_reason"),
    provider: text("provider").notNull(),
    model: text("model"),
    status: text("status").notNull(),
    error: text("error"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    finishedAt: optionalTimestamp("finished_at"),
  },
  (table) => [index("contract_question_contract_idx").on(table.organizationId, table.contractId)],
);

export const questionCitation = sqliteTable(
  "question_citation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => contractQuestion.id, { onDelete: "cascade" }),
    quote: text("quote").notNull(),
    page: integer("page"),
  },
  (table) => [index("question_citation_question_idx").on(table.questionId)],
);

export const versionComparison = sqliteTable(
  "version_comparison",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    leftDocumentId: text("left_document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    rightDocumentId: text("right_document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    summary: text("summary"),
    provider: text("provider").notNull(),
    model: text("model"),
    status: text("status").notNull(),
    error: text("error"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    finishedAt: optionalTimestamp("finished_at"),
  },
  (table) => [index("version_comparison_contract_idx").on(table.organizationId, table.contractId)],
);

export const comparisonChange = sqliteTable(
  "comparison_change",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    comparisonId: text("comparison_id")
      .notNull()
      .references(() => versionComparison.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    beforeText: text("before_text"),
    afterText: text("after_text"),
    citationA: text("citation_a"),
    citationB: text("citation_b"),
  },
  (table) => [index("comparison_change_comparison_idx").on(table.comparisonId)],
);

export const signatureEnvelope = sqliteTable(
  "signature_envelope",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => contractVersion.id),
    sourceDocumentId: text("source_document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    executedDocumentId: text("executed_document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    certificateDocumentId: text("certificate_document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    providerEnvelopeId: text("provider_envelope_id"),
    status: text("status").notNull(),
    title: text("title"),
    message: text("message"),
    testMode: integer("test_mode", { mode: "boolean" }).notNull().default(true),
    sentAt: optionalTimestamp("sent_at"),
    completedAt: optionalTimestamp("completed_at"),
    declinedAt: optionalTimestamp("declined_at"),
    expiredAt: optionalTimestamp("expired_at"),
    failedAt: optionalTimestamp("failed_at"),
    cancelledAt: optionalTimestamp("cancelled_at"),
    failureReason: text("failure_reason"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("signature_envelope_provider_idx").on(table.provider, table.providerEnvelopeId),
    index("signature_envelope_contract_idx").on(table.organizationId, table.contractId),
  ],
);

export const signatureSigner = sqliteTable(
  "signature_signer",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    envelopeId: text("envelope_id")
      .notNull()
      .references(() => signatureEnvelope.id, { onDelete: "cascade" }),
    partyId: text("party_id").references(() => contractParty.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role"),
    routingOrder: integer("routing_order").notNull().default(1),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    status: text("status").notNull(),
    providerSignerId: text("provider_signer_id"),
    declineReason: text("decline_reason"),
    sentAt: optionalTimestamp("sent_at"),
    viewedAt: optionalTimestamp("viewed_at"),
    signedAt: optionalTimestamp("signed_at"),
    declinedAt: optionalTimestamp("declined_at"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("signature_signer_envelope_idx").on(table.organizationId, table.envelopeId)],
);

export const signatureEvent = sqliteTable(
  "signature_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    envelopeId: text("envelope_id")
      .notNull()
      .references(() => signatureEnvelope.id, { onDelete: "cascade" }),
    signerId: text("signer_id").references(() => signatureSigner.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash"),
    occurredAt: timestamp("occurred_at"),
    receivedAt: timestamp("received_at"),
    processedAt: optionalTimestamp("processed_at"),
  },
  (table) => [
    uniqueIndex("signature_event_provider_idx").on(table.provider, table.providerEventId),
    index("signature_event_envelope_idx").on(table.organizationId, table.envelopeId),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(membership),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  memberships: many(membership),
  records: many(tenantRecord),
  vendors: many(vendor),
  contracts: many(contract),
}));

export const membershipRelations = relations(membership, ({ one }) => ({
  organization: one(organization, {
    fields: [membership.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [membership.userId], references: [user.id] }),
}));

export const tenantRecordRelations = relations(tenantRecord, ({ one }) => ({
  organization: one(organization, {
    fields: [tenantRecord.organizationId],
    references: [organization.id],
  }),
}));

export const vendorRelations = relations(vendor, ({ one, many }) => ({
  organization: one(organization, {
    fields: [vendor.organizationId],
    references: [organization.id],
  }),
  contracts: many(contract),
  transactions: many(financialTransaction),
  savings: many(savingsOpportunity),
}));

export const contractRelations = relations(contract, ({ one, many }) => ({
  organization: one(organization, {
    fields: [contract.organizationId],
    references: [organization.id],
  }),
  vendor: one(vendor, { fields: [contract.vendorId], references: [vendor.id] }),
  versions: many(contractVersion),
  parties: many(contractParty),
  documents: many(document),
  obligations: many(obligation),
  envelopes: many(signatureEnvelope),
  renewalWatches: many(renewalWatch),
  paymentMilestones: many(paymentMilestone),
  transactions: many(financialTransaction),
  priceEscalations: many(priceEscalation),
  savings: many(savingsOpportunity),
  outgoingRelations: many(contractRelation, { relationName: "contractRelationFrom" }),
  incomingRelations: many(contractRelation, { relationName: "contractRelationTo" }),
}));

export const contractVersionRelations = relations(contractVersion, ({ one }) => ({
  contract: one(contract, { fields: [contractVersion.contractId], references: [contract.id] }),
}));

export const documentRelations = relations(document, ({ one }) => ({
  contract: one(contract, { fields: [document.contractId], references: [contract.id] }),
}));

export const contractRelationRelations = relations(contractRelation, ({ one }) => ({
  organization: one(organization, {
    fields: [contractRelation.organizationId],
    references: [organization.id],
  }),
  fromContract: one(contract, {
    fields: [contractRelation.fromContractId],
    references: [contract.id],
    relationName: "contractRelationFrom",
  }),
  toContract: one(contract, {
    fields: [contractRelation.toContractId],
    references: [contract.id],
    relationName: "contractRelationTo",
  }),
}));

export const contractPartyRelations = relations(contractParty, ({ one }) => ({
  contract: one(contract, { fields: [contractParty.contractId], references: [contract.id] }),
}));

export const riskRuleRelations = relations(riskRule, ({ one }) => ({
  organization: one(organization, {
    fields: [riskRule.organizationId],
    references: [organization.id],
  }),
}));

export const riskAssessmentRelations = relations(riskAssessment, ({ one, many }) => ({
  contract: one(contract, { fields: [riskAssessment.contractId], references: [contract.id] }),
  findings: many(riskFinding),
}));

export const riskPolicyRelations = relations(riskPolicy, ({ one }) => ({
  organization: one(organization, {
    fields: [riskPolicy.organizationId],
    references: [organization.id],
  }),
}));

export const riskFindingRelations = relations(riskFinding, ({ one }) => ({
  assessment: one(riskAssessment, {
    fields: [riskFinding.assessmentId],
    references: [riskAssessment.id],
  }),
  rule: one(riskRule, { fields: [riskFinding.ruleId], references: [riskRule.id] }),
}));

export const clauseTemplateRelations = relations(clauseTemplate, ({ many }) => ({
  versions: many(clauseVersion),
  usages: many(clauseUsage),
  alternatives: many(clauseAlternative, { relationName: "clause_alternative_from" }),
}));

export const clauseVersionRelations = relations(clauseVersion, ({ one }) => ({
  template: one(clauseTemplate, {
    fields: [clauseVersion.templateId],
    references: [clauseTemplate.id],
  }),
}));

export const clauseAlternativeRelations = relations(clauseAlternative, ({ one }) => ({
  template: one(clauseTemplate, {
    fields: [clauseAlternative.templateId],
    references: [clauseTemplate.id],
    relationName: "clause_alternative_from",
  }),
}));

export const clauseUsageRelations = relations(clauseUsage, ({ one }) => ({
  template: one(clauseTemplate, {
    fields: [clauseUsage.templateId],
    references: [clauseTemplate.id],
  }),
  contract: one(contract, { fields: [clauseUsage.contractId], references: [contract.id] }),
}));

export const approvalWorkflowTemplateRelations = relations(
  approvalWorkflowTemplate,
  ({ many }) => ({
    stages: many(approvalStageTemplate),
  }),
);

export const approvalStageTemplateRelations = relations(approvalStageTemplate, ({ one }) => ({
  template: one(approvalWorkflowTemplate, {
    fields: [approvalStageTemplate.templateId],
    references: [approvalWorkflowTemplate.id],
  }),
}));

export const approvalRequestRelations = relations(approvalRequest, ({ one, many }) => ({
  contract: one(contract, { fields: [approvalRequest.contractId], references: [contract.id] }),
  stages: many(approvalStage),
  comments: many(approvalComment),
  events: many(approvalEvent),
}));

export const approvalStageRelations = relations(approvalStage, ({ one }) => ({
  request: one(approvalRequest, {
    fields: [approvalStage.requestId],
    references: [approvalRequest.id],
  }),
}));

export const approvalCommentRelations = relations(approvalComment, ({ one }) => ({
  request: one(approvalRequest, {
    fields: [approvalComment.requestId],
    references: [approvalRequest.id],
  }),
}));

export const approvalEventRelations = relations(approvalEvent, ({ one }) => ({
  request: one(approvalRequest, {
    fields: [approvalEvent.requestId],
    references: [approvalRequest.id],
  }),
}));

export const obligationRelations = relations(obligation, ({ one, many }) => ({
  contract: one(contract, { fields: [obligation.contractId], references: [contract.id] }),
  events: many(obligationEvent),
}));

export const obligationEventRelations = relations(obligationEvent, ({ one }) => ({
  obligation: one(obligation, {
    fields: [obligationEvent.obligationId],
    references: [obligation.id],
  }),
}));

export const renewalWatchRelations = relations(renewalWatch, ({ one, many }) => ({
  contract: one(contract, { fields: [renewalWatch.contractId], references: [contract.id] }),
  events: many(renewalEvent),
}));

export const renewalEventRelations = relations(renewalEvent, ({ one }) => ({
  watch: one(renewalWatch, { fields: [renewalEvent.watchId], references: [renewalWatch.id] }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  organization: one(organization, {
    fields: [notification.organizationId],
    references: [organization.id],
  }),
}));

export const notificationPreferenceRelations = relations(notificationPreference, ({ one }) => ({
  organization: one(organization, {
    fields: [notificationPreference.organizationId],
    references: [organization.id],
  }),
}));

export const notificationDeliveryRelations = relations(notificationDelivery, ({ one }) => ({
  notification: one(notification, {
    fields: [notificationDelivery.notificationId],
    references: [notification.id],
  }),
}));

export const integrationConnectionRelations = relations(integrationConnection, ({ one }) => ({
  organization: one(organization, {
    fields: [integrationConnection.organizationId],
    references: [organization.id],
  }),
}));

export const integrationWebhookEventRelations = relations(integrationWebhookEvent, ({ one }) => ({
  organization: one(organization, {
    fields: [integrationWebhookEvent.organizationId],
    references: [organization.id],
  }),
}));

export const integrationRunRelations = relations(integrationRun, ({ one }) => ({
  organization: one(organization, {
    fields: [integrationRun.organizationId],
    references: [organization.id],
  }),
}));

export const extractionRunRelations = relations(extractionRun, ({ one, many }) => ({
  contract: one(contract, { fields: [extractionRun.contractId], references: [contract.id] }),
  document: one(document, { fields: [extractionRun.documentId], references: [document.id] }),
  fields: many(extractedField),
  parties: many(extractedParty),
  clauses: many(extractedClause),
  obligations: many(extractedObligation),
}));

export const extractedFieldRelations = relations(extractedField, ({ one }) => ({
  run: one(extractionRun, { fields: [extractedField.runId], references: [extractionRun.id] }),
}));

export const extractedPartyRelations = relations(extractedParty, ({ one }) => ({
  run: one(extractionRun, { fields: [extractedParty.runId], references: [extractionRun.id] }),
}));

export const extractedClauseRelations = relations(extractedClause, ({ one }) => ({
  run: one(extractionRun, { fields: [extractedClause.runId], references: [extractionRun.id] }),
}));

export const extractedObligationRelations = relations(extractedObligation, ({ one }) => ({
  run: one(extractionRun, { fields: [extractedObligation.runId], references: [extractionRun.id] }),
}));

export const contractQuestionRelations = relations(contractQuestion, ({ one, many }) => ({
  contract: one(contract, { fields: [contractQuestion.contractId], references: [contract.id] }),
  citations: many(questionCitation),
}));

export const questionCitationRelations = relations(questionCitation, ({ one }) => ({
  question: one(contractQuestion, {
    fields: [questionCitation.questionId],
    references: [contractQuestion.id],
  }),
}));

export const versionComparisonRelations = relations(versionComparison, ({ one, many }) => ({
  contract: one(contract, { fields: [versionComparison.contractId], references: [contract.id] }),
  changes: many(comparisonChange),
}));

export const comparisonChangeRelations = relations(comparisonChange, ({ one }) => ({
  comparison: one(versionComparison, {
    fields: [comparisonChange.comparisonId],
    references: [versionComparison.id],
  }),
}));

export const signatureEnvelopeRelations = relations(signatureEnvelope, ({ one, many }) => ({
  contract: one(contract, { fields: [signatureEnvelope.contractId], references: [contract.id] }),
  signers: many(signatureSigner),
  events: many(signatureEvent),
}));

export const signatureSignerRelations = relations(signatureSigner, ({ one }) => ({
  envelope: one(signatureEnvelope, {
    fields: [signatureSigner.envelopeId],
    references: [signatureEnvelope.id],
  }),
}));

export const signatureEventRelations = relations(signatureEvent, ({ one }) => ({
  envelope: one(signatureEnvelope, {
    fields: [signatureEvent.envelopeId],
    references: [signatureEnvelope.id],
  }),
}));

export const paymentMilestoneRelations = relations(paymentMilestone, ({ one }) => ({
  organization: one(organization, {
    fields: [paymentMilestone.organizationId],
    references: [organization.id],
  }),
  contract: one(contract, {
    fields: [paymentMilestone.contractId],
    references: [contract.id],
  }),
}));

export const financialTransactionRelations = relations(financialTransaction, ({ one }) => ({
  organization: one(organization, {
    fields: [financialTransaction.organizationId],
    references: [organization.id],
  }),
  contract: one(contract, {
    fields: [financialTransaction.contractId],
    references: [contract.id],
  }),
  vendor: one(vendor, {
    fields: [financialTransaction.vendorId],
    references: [vendor.id],
  }),
}));

export const priceEscalationRelations = relations(priceEscalation, ({ one }) => ({
  organization: one(organization, {
    fields: [priceEscalation.organizationId],
    references: [organization.id],
  }),
  contract: one(contract, {
    fields: [priceEscalation.contractId],
    references: [contract.id],
  }),
}));

export const savingsOpportunityRelations = relations(savingsOpportunity, ({ one }) => ({
  organization: one(organization, {
    fields: [savingsOpportunity.organizationId],
    references: [organization.id],
  }),
  contract: one(contract, {
    fields: [savingsOpportunity.contractId],
    references: [contract.id],
  }),
  vendor: one(vendor, {
    fields: [savingsOpportunity.vendorId],
    references: [vendor.id],
  }),
}));

export const assistantThread = sqliteTable(
  "assistant_thread",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("assistant_thread_user_idx").on(
      table.organizationId,
      table.createdByUserId,
      table.updatedAt,
    ),
  ],
);

export const assistantMessage = sqliteTable(
  "assistant_message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThread.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    intent: text("intent"),
    status: text("status").notNull(),
    insufficientEvidence: integer("insufficient_evidence", { mode: "boolean" })
      .notNull()
      .default(false),
    disclaimer: text("disclaimer"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("assistant_message_thread_idx").on(table.organizationId, table.threadId, table.createdAt),
  ],
);

export const assistantCitation = sqliteTable(
  "assistant_citation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => assistantMessage.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    quote: text("quote"),
    page: integer("page"),
    contractId: text("contract_id").references(() => contract.id, { onDelete: "set null" }),
    documentId: text("document_id").references(() => document.id, { onDelete: "set null" }),
    clauseTemplateId: text("clause_template_id").references(() => clauseTemplate.id, {
      onDelete: "set null",
    }),
    obligationId: text("obligation_id").references(() => obligation.id, { onDelete: "set null" }),
    href: text("href"),
  },
  (table) => [index("assistant_citation_message_idx").on(table.organizationId, table.messageId)],
);

export const assistantToolCall = sqliteTable(
  "assistant_tool_call",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThread.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => assistantMessage.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    inputJson: text("input_json").notNull(),
    resultJson: text("result_json").notNull(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("assistant_tool_call_thread_idx").on(
      table.organizationId,
      table.threadId,
      table.createdAt,
    ),
  ],
);

export const assistantProposal = sqliteTable(
  "assistant_proposal",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThread.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => assistantMessage.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    templateIdsJson: text("template_ids_json").notNull(),
    createdContractId: text("created_contract_id").references(() => contract.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    confirmedByUserId: text("confirmed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at"),
    decidedAt: optionalTimestamp("decided_at"),
  },
  (table) => [index("assistant_proposal_thread_idx").on(table.organizationId, table.threadId)],
);

export const assistantThreadRelations = relations(assistantThread, ({ one, many }) => ({
  organization: one(organization, {
    fields: [assistantThread.organizationId],
    references: [organization.id],
  }),
  createdBy: one(user, {
    fields: [assistantThread.createdByUserId],
    references: [user.id],
  }),
  messages: many(assistantMessage),
  proposals: many(assistantProposal),
}));

export const assistantMessageRelations = relations(assistantMessage, ({ one, many }) => ({
  organization: one(organization, {
    fields: [assistantMessage.organizationId],
    references: [organization.id],
  }),
  thread: one(assistantThread, {
    fields: [assistantMessage.threadId],
    references: [assistantThread.id],
  }),
  citations: many(assistantCitation),
  proposals: many(assistantProposal),
}));

export const assistantCitationRelations = relations(assistantCitation, ({ one }) => ({
  organization: one(organization, {
    fields: [assistantCitation.organizationId],
    references: [organization.id],
  }),
  message: one(assistantMessage, {
    fields: [assistantCitation.messageId],
    references: [assistantMessage.id],
  }),
  contract: one(contract, {
    fields: [assistantCitation.contractId],
    references: [contract.id],
  }),
}));

export const assistantToolCallRelations = relations(assistantToolCall, ({ one }) => ({
  organization: one(organization, {
    fields: [assistantToolCall.organizationId],
    references: [organization.id],
  }),
  thread: one(assistantThread, {
    fields: [assistantToolCall.threadId],
    references: [assistantThread.id],
  }),
}));

export const assistantProposalRelations = relations(assistantProposal, ({ one }) => ({
  organization: one(organization, {
    fields: [assistantProposal.organizationId],
    references: [organization.id],
  }),
  thread: one(assistantThread, {
    fields: [assistantProposal.threadId],
    references: [assistantThread.id],
  }),
  message: one(assistantMessage, {
    fields: [assistantProposal.messageId],
    references: [assistantMessage.id],
  }),
  createdContract: one(contract, {
    fields: [assistantProposal.createdContractId],
    references: [contract.id],
  }),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  organization,
  membership,
  tenantRecord,
  auditEvent,
  vendor,
  contract,
  contractVersion,
  document,
  contractRelation,
  contractParty,
  riskRule,
  riskAssessment,
  riskPolicy,
  riskFinding,
  clauseTemplate,
  clauseVersion,
  clauseAlternative,
  clauseUsage,
  approvalWorkflowTemplate,
  approvalStageTemplate,
  approvalRequest,
  approvalStage,
  approvalComment,
  approvalEvent,
  obligation,
  obligationEvent,
  renewalWatch,
  renewalEvent,
  reminderReceipt,
  paymentMilestone,
  financialTransaction,
  priceEscalation,
  savingsOpportunity,
  assistantThread,
  assistantMessage,
  assistantCitation,
  assistantToolCall,
  assistantProposal,
  notification,
  notificationPreference,
  notificationDelivery,
  integrationConnection,
  integrationWebhookEvent,
  integrationRun,
  extractionRun,
  extractedField,
  extractedParty,
  extractedClause,
  extractedObligation,
  contractQuestion,
  questionCitation,
  versionComparison,
  comparisonChange,
  signatureEnvelope,
  signatureSigner,
  signatureEvent,
  userRelations,
  sessionRelations,
  accountRelations,
  organizationRelations,
  membershipRelations,
  tenantRecordRelations,
  vendorRelations,
  contractRelations,
  contractVersionRelations,
  documentRelations,
  contractRelationRelations,
  contractPartyRelations,
  riskRuleRelations,
  riskAssessmentRelations,
  riskPolicyRelations,
  riskFindingRelations,
  clauseTemplateRelations,
  clauseVersionRelations,
  clauseAlternativeRelations,
  clauseUsageRelations,
  approvalWorkflowTemplateRelations,
  approvalStageTemplateRelations,
  approvalRequestRelations,
  approvalStageRelations,
  approvalCommentRelations,
  approvalEventRelations,
  obligationRelations,
  obligationEventRelations,
  renewalWatchRelations,
  renewalEventRelations,
  notificationRelations,
  notificationPreferenceRelations,
  notificationDeliveryRelations,
  integrationConnectionRelations,
  integrationWebhookEventRelations,
  integrationRunRelations,
  extractionRunRelations,
  extractedFieldRelations,
  extractedPartyRelations,
  extractedClauseRelations,
  extractedObligationRelations,
  contractQuestionRelations,
  questionCitationRelations,
  versionComparisonRelations,
  comparisonChangeRelations,
  signatureEnvelopeRelations,
  signatureSignerRelations,
  signatureEventRelations,
  paymentMilestoneRelations,
  financialTransactionRelations,
  priceEscalationRelations,
  savingsOpportunityRelations,
  assistantThreadRelations,
  assistantMessageRelations,
  assistantCitationRelations,
  assistantToolCallRelations,
  assistantProposalRelations,
};
