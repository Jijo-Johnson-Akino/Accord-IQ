import { and, eq } from "drizzle-orm";
import { loadConfig } from "@accordiq/core";
import { SEED, seedDatabase } from "@accordiq/auth";
import {
  approvalStageTemplate,
  approvalWorkflowTemplate,
  applySqliteDdl,
  clauseAlternative,
  clauseTemplate,
  clauseUsage,
  clauseVersion,
  contract,
  contractParty,
  contractVersion,
  createDb,
  createSqliteClient,
  document,
  obligation,
  riskAssessment,
  riskPolicy,
  riskRule,
  vendor,
  type Database,
} from "@accordiq/db";
import { PROPOSED_DEFAULT_POLICY } from "./risk-engine";
import { PROPOSED_DEFAULT_RULES } from "./risk-defaults";

export const CLM_SEED = {
  vendors: {
    northwindAcme: { id: "vendor_nw_acme", name: "Acme Supplies", website: "https://acme.example" },
    contosoGlobex: { id: "vendor_co_globex", name: "Globex", website: "https://globex.example" },
  },
  contracts: {
    northwindMsa: {
      id: "contract_nw_msa",
      title: "Acme master services agreement",
      versionId: "version_nw_msa_1",
    },
    contosoNda: {
      id: "contract_co_nda",
      title: "Globex mutual NDA",
      versionId: "version_co_nda_1",
    },
  },
  workflows: {
    northwindLegalFinance: { id: "workflow_nw_legal_finance", name: "Legal then finance" },
    northwindParallel: {
      id: "workflow_nw_parallel",
      name: "Legal, finance and procurement, then manager",
    },
    northwindValueGate: {
      id: "workflow_nw_value",
      name: "Legal then finance above threshold",
    },
    contosoAdmin: { id: "workflow_co_admin", name: "Admin review" },
  },
  riskRules: {
    northwindTerm: { id: "rule_nw_term", code: "TERM_LENGTH" },
    northwindRenew: { id: "rule_nw_renew", code: "AUTO_RENEW" },
    contosoTerm: { id: "rule_co_term", code: "TERM_LENGTH" },
  },
  clauses: {
    northwindConfidentiality: {
      id: "clause_nw_conf",
      versionId: "cver_nw_conf_1",
      code: "CONFIDENTIALITY",
    },
    northwindConfidentialityAlt: {
      id: "clause_nw_conf_alt",
      versionId: "cver_nw_conf_alt_1",
      code: "CONFIDENTIALITY_ALT",
    },
  },
} as const;

function now(): Date {
  return new Date();
}

async function insertVendor(
  db: Database,
  input: {
    id: string;
    organizationId: string;
    name: string;
    website: string;
    createdByUserId: string;
  },
) {
  const existing = await db.query.vendor.findFirst({ where: eq(vendor.id, input.id) });
  if (existing) return;
  await db.insert(vendor).values({
    ...input,
    status: "ACTIVE",
    createdAt: now(),
    updatedAt: now(),
  });
}

function catalogRuleId(orgKey: "nw" | "co", code: string): string {
  if (orgKey === "nw" && code === "TERM_LENGTH") return CLM_SEED.riskRules.northwindTerm.id;
  if (orgKey === "nw" && code === "AUTO_RENEW") return CLM_SEED.riskRules.northwindRenew.id;
  if (orgKey === "co" && code === "TERM_LENGTH") return CLM_SEED.riskRules.contosoTerm.id;
  return `rule_${orgKey}_${code.toLowerCase()}`;
}

async function upsertCatalogRules(
  db: Database,
  input: { organizationId: string; orgKey: "nw" | "co"; createdByUserId: string },
) {
  for (const catalog of PROPOSED_DEFAULT_RULES) {
    const existing = await db.query.riskRule.findFirst({
      where: and(
        eq(riskRule.organizationId, input.organizationId),
        eq(riskRule.code, catalog.code),
      ),
    });
    const fields = {
      name: catalog.name,
      description: "Proposed default rule. Weights are starting points, not an official scale.",
      severity: catalog.severity,
      category: catalog.category,
      predicateJson: JSON.stringify(catalog.predicate),
      weight: catalog.weight,
      remediation: catalog.remediation,
      explanationTemplate: catalog.explanationTemplate,
      updatedAt: now(),
    };
    if (existing) {
      if (!existing.predicateJson) {
        await db.update(riskRule).set(fields).where(eq(riskRule.id, existing.id));
      }
      continue;
    }
    await db.insert(riskRule).values({
      id: catalogRuleId(input.orgKey, catalog.code),
      organizationId: input.organizationId,
      code: catalog.code,
      status: "ACTIVE",
      versionNumber: 1,
      createdByUserId: input.createdByUserId,
      createdAt: now(),
      ...fields,
    });
  }
}

async function ensureSeedPolicy(
  db: Database,
  input: { id: string; organizationId: string; updatedByUserId: string },
) {
  const existing = await db.query.riskPolicy.findFirst({
    where: eq(riskPolicy.organizationId, input.organizationId),
  });
  if (existing) return;
  await db.insert(riskPolicy).values({
    id: input.id,
    organizationId: input.organizationId,
    ...PROPOSED_DEFAULT_POLICY,
    updatedByUserId: input.updatedByUserId,
    createdAt: now(),
    updatedAt: now(),
  });
}

async function insertContractWithVersion(
  db: Database,
  input: {
    id: string;
    organizationId: string;
    title: string;
    vendorId: string;
    versionId: string;
    createdByUserId: string;
    category: string;
    currency: string;
    valueMinor: number | null;
    department?: string | null;
    noticeDays?: number | null;
    autoRenew?: boolean;
  },
) {
  const existing = await db.query.contract.findFirst({ where: eq(contract.id, input.id) });
  if (existing) {
    const patch: {
      category?: string;
      currency?: string;
      valueMinor?: number | null;
      department?: string | null;
      noticeDays?: number | null;
      autoRenew?: boolean;
      updatedAt: Date;
    } = {
      updatedAt: now(),
    };
    if (existing.category == null) {
      patch.category = input.category;
      patch.currency = input.currency;
      patch.valueMinor = input.valueMinor;
    }
    if (existing.department == null && input.department) {
      patch.department = input.department;
    }
    if (existing.noticeDays == null && input.noticeDays != null) {
      patch.noticeDays = input.noticeDays;
    }
    if (input.autoRenew != null && existing.autoRenew !== input.autoRenew) {
      patch.autoRenew = input.autoRenew;
    }
    if (Object.keys(patch).length > 1) {
      await db.update(contract).set(patch).where(eq(contract.id, input.id));
    }
    return;
  }
  await db.transaction(async (tx) => {
    await tx.insert(contract).values({
      id: input.id,
      organizationId: input.organizationId,
      title: input.title,
      status: "DRAFT",
      vendorId: input.vendorId,
      ownerUserId: input.createdByUserId,
      currentVersionId: input.versionId,
      effectiveOn: "2026-01-01",
      expiresOn: "2026-12-31",
      category: input.category,
      currency: input.currency,
      valueMinor: input.valueMinor,
      department: input.department ?? null,
      noticeDays: input.noticeDays ?? null,
      autoRenew: input.autoRenew ?? false,
      createdByUserId: input.createdByUserId,
      createdAt: now(),
      updatedAt: now(),
    });
    await tx.insert(contractVersion).values({
      id: input.versionId,
      organizationId: input.organizationId,
      contractId: input.id,
      versionNumber: 1,
      status: "DRAFT",
      summary: "Development seed version",
      createdByUserId: input.createdByUserId,
      createdAt: now(),
    });
  });
}

/**
 * Idempotent CLM sample rows for local development and tests. Never deletes existing data.
 * Refuses to run when NODE_ENV=production.
 */
export async function seedClm(db: Database): Promise<void> {
  if (loadConfig().NODE_ENV === "production") {
    throw new Error("Refusing to seed the production database.");
  }

  const { organizations, users } = SEED;
  const nw = organizations.northwind.id;
  const co = organizations.contoso.id;
  const nwAdmin = users.northwindAdmin.id;
  const coAdmin = users.contosoAdmin.id;

  await insertVendor(db, {
    ...CLM_SEED.vendors.northwindAcme,
    organizationId: nw,
    createdByUserId: nwAdmin,
  });
  await insertVendor(db, {
    ...CLM_SEED.vendors.contosoGlobex,
    organizationId: co,
    createdByUserId: coAdmin,
  });

  await insertContractWithVersion(db, {
    id: CLM_SEED.contracts.northwindMsa.id,
    organizationId: nw,
    title: CLM_SEED.contracts.northwindMsa.title,
    vendorId: CLM_SEED.vendors.northwindAcme.id,
    versionId: CLM_SEED.contracts.northwindMsa.versionId,
    createdByUserId: nwAdmin,
    category: "MSA",
    currency: "USD",
    valueMinor: 12500000,
    department: "OPERATIONS",
    noticeDays: 90,
    autoRenew: false,
  });
  await insertContractWithVersion(db, {
    id: CLM_SEED.contracts.contosoNda.id,
    organizationId: co,
    title: CLM_SEED.contracts.contosoNda.title,
    vendorId: CLM_SEED.vendors.contosoGlobex.id,
    versionId: CLM_SEED.contracts.contosoNda.versionId,
    createdByUserId: coAdmin,
    category: "NDA",
    currency: "USD",
    valueMinor: null,
  });

  const nwParty = await db.query.contractParty.findFirst({
    where: eq(contractParty.id, "party_nw_msa_internal"),
  });
  if (!nwParty) {
    await db.insert(contractParty).values([
      {
        id: "party_nw_msa_internal",
        organizationId: nw,
        contractId: CLM_SEED.contracts.northwindMsa.id,
        vendorId: null,
        name: "Northwind",
        role: "INTERNAL",
        email: "legal@northwind.example",
        createdAt: now(),
      },
      {
        id: "party_nw_msa_vendor",
        organizationId: nw,
        contractId: CLM_SEED.contracts.northwindMsa.id,
        vendorId: CLM_SEED.vendors.northwindAcme.id,
        name: "Acme Supplies",
        role: "COUNTERPARTY",
        email: "contracts@acme.example",
        createdAt: now(),
      },
    ]);
  }

  const nwDoc = await db.query.document.findFirst({ where: eq(document.id, "doc_nw_msa") });
  if (!nwDoc) {
    await db.insert(document).values({
      id: "doc_nw_msa",
      organizationId: nw,
      contractId: CLM_SEED.contracts.northwindMsa.id,
      versionId: CLM_SEED.contracts.northwindMsa.versionId,
      fileName: "acme-msa.pdf",
      contentType: "application/pdf",
      byteSize: 1024,
      storageKey: null,
      status: "QUEUED",
      sha256: null,
      processingError: null,
      processedAt: null,
      pageCount: null,
      idempotencyKey: null,
      createdByUserId: nwAdmin,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  const nwObligation = await db.query.obligation.findFirst({
    where: eq(obligation.id, "ob_nw_insurance"),
  });
  if (!nwObligation) {
    await db.insert(obligation).values({
      id: "ob_nw_insurance",
      organizationId: nw,
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Certificate of insurance",
      description: "Counterparty must keep coverage current.",
      dueOn: "2026-12-31",
      status: "OPEN",
      ownerUserId: users.northwindLegal.id,
      frequency: "ONCE",
      intervalCount: 1,
      priority: "HIGH",
      reminderDaysBefore: 30,
      escalateDaysAfter: 7,
      occurrenceIndex: 1,
      timezone: "UTC",
      createdByUserId: nwAdmin,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  await upsertCatalogRules(db, {
    organizationId: nw,
    orgKey: "nw",
    createdByUserId: nwAdmin,
  });
  await upsertCatalogRules(db, {
    organizationId: co,
    orgKey: "co",
    createdByUserId: coAdmin,
  });
  await ensureSeedPolicy(db, {
    id: "policy_nw",
    organizationId: nw,
    updatedByUserId: nwAdmin,
  });
  await ensureSeedPolicy(db, {
    id: "policy_co",
    organizationId: co,
    updatedByUserId: coAdmin,
  });

  const nwRisk = await db.query.riskAssessment.findFirst({
    where: eq(riskAssessment.id, "risk_nw_msa"),
  });
  if (!nwRisk) {
    await db.insert(riskAssessment).values({
      id: "risk_nw_msa",
      organizationId: nw,
      contractId: CLM_SEED.contracts.northwindMsa.id,
      versionId: CLM_SEED.contracts.northwindMsa.versionId,
      overallSeverity: "MEDIUM",
      status: "COMPLETE",
      summary:
        "Development seed assessment that predates the deterministic engine. Not a scored production result.",
      assessmentNumber: 1,
      score: 0,
      scoreMethod: "SUM_WEIGHTS_CAPPED_100",
      policyJson: null,
      ruleSetHash: null,
      stale: false,
      engineVersion: null,
      createdByUserId: users.northwindLegal.id,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  const nwClause = await db.query.clauseTemplate.findFirst({
    where: eq(clauseTemplate.id, CLM_SEED.clauses.northwindConfidentiality.id),
  });
  if (!nwClause) {
    const approvedAt = now();
    await db.insert(clauseTemplate).values({
      id: CLM_SEED.clauses.northwindConfidentiality.id,
      organizationId: nw,
      code: CLM_SEED.clauses.northwindConfidentiality.code,
      title: "Standard confidentiality",
      category: "CONFIDENTIALITY",
      jurisdiction: "Delaware",
      contractTypes: JSON.stringify(["MSA", "NDA"]),
      status: "APPROVED",
      currentVersionId: CLM_SEED.clauses.northwindConfidentiality.versionId,
      createdByUserId: users.northwindLegal.id,
      createdAt: approvedAt,
      updatedAt: approvedAt,
    });
    await db.insert(clauseVersion).values({
      id: CLM_SEED.clauses.northwindConfidentiality.versionId,
      organizationId: nw,
      templateId: CLM_SEED.clauses.northwindConfidentiality.id,
      versionNumber: 1,
      body: "Each party shall keep the other party's confidential information secret and use it only to perform this agreement.",
      changeSummary: "Approved seed language. Not a playbook mandate.",
      status: "APPROVED",
      approvedByUserId: users.northwindLegal.id,
      approvedAt,
      createdByUserId: users.northwindLegal.id,
      createdAt: approvedAt,
    });
    await db.insert(clauseTemplate).values({
      id: CLM_SEED.clauses.northwindConfidentialityAlt.id,
      organizationId: nw,
      code: CLM_SEED.clauses.northwindConfidentialityAlt.code,
      title: "Mutual confidentiality (narrow)",
      category: "CONFIDENTIALITY",
      jurisdiction: "Delaware",
      contractTypes: JSON.stringify(["NDA"]),
      status: "APPROVED",
      currentVersionId: CLM_SEED.clauses.northwindConfidentialityAlt.versionId,
      createdByUserId: users.northwindLegal.id,
      createdAt: approvedAt,
      updatedAt: approvedAt,
    });
    await db.insert(clauseVersion).values({
      id: CLM_SEED.clauses.northwindConfidentialityAlt.versionId,
      organizationId: nw,
      templateId: CLM_SEED.clauses.northwindConfidentialityAlt.id,
      versionNumber: 1,
      body: "Confidential information excludes information that is public, independently developed, or required to be disclosed by law.",
      changeSummary: "Narrower alternative for mutual NDAs.",
      status: "APPROVED",
      approvedByUserId: users.northwindLegal.id,
      approvedAt,
      createdByUserId: users.northwindLegal.id,
      createdAt: approvedAt,
    });
    await db.insert(clauseAlternative).values({
      id: "clause_alt_nw_conf",
      organizationId: nw,
      templateId: CLM_SEED.clauses.northwindConfidentiality.id,
      alternativeTemplateId: CLM_SEED.clauses.northwindConfidentialityAlt.id,
      note: "Use the narrower form on mutual NDAs.",
      createdByUserId: users.northwindLegal.id,
      createdAt: approvedAt,
    });
    await db.insert(clauseUsage).values({
      id: "clause_use_nw_msa_conf",
      organizationId: nw,
      templateId: CLM_SEED.clauses.northwindConfidentiality.id,
      versionId: CLM_SEED.clauses.northwindConfidentiality.versionId,
      contractId: CLM_SEED.contracts.northwindMsa.id,
      createdByUserId: users.northwindLegal.id,
      createdAt: approvedAt,
    });
  }

  const nwWorkflow = await db.query.approvalWorkflowTemplate.findFirst({
    where: eq(approvalWorkflowTemplate.id, CLM_SEED.workflows.northwindLegalFinance.id),
  });
  if (!nwWorkflow) {
    await db.transaction(async (tx) => {
      await tx.insert(approvalWorkflowTemplate).values({
        id: CLM_SEED.workflows.northwindLegalFinance.id,
        organizationId: nw,
        name: CLM_SEED.workflows.northwindLegalFinance.name,
        status: "ACTIVE",
        createdByUserId: nwAdmin,
        createdAt: now(),
        updatedAt: now(),
      });
      await tx.insert(approvalStageTemplate).values([
        {
          id: "stage_tpl_nw_legal",
          organizationId: nw,
          templateId: CLM_SEED.workflows.northwindLegalFinance.id,
          position: 1,
          name: "Legal review",
          requiredRole: "LEGAL",
          step: 1,
          dueInDays: 5,
          reminderHoursBefore: 24,
          escalateToRole: "ORGANIZATION_ADMIN",
          allowDelegate: true,
        },
        {
          id: "stage_tpl_nw_finance",
          organizationId: nw,
          templateId: CLM_SEED.workflows.northwindLegalFinance.id,
          position: 2,
          name: "Finance review",
          requiredRole: "FINANCE",
          step: 2,
          dueInDays: 5,
          reminderHoursBefore: 24,
          escalateToRole: "ORGANIZATION_ADMIN",
          allowDelegate: true,
        },
      ]);
    });
  }

  const coWorkflow = await db.query.approvalWorkflowTemplate.findFirst({
    where: eq(approvalWorkflowTemplate.id, CLM_SEED.workflows.contosoAdmin.id),
  });
  if (!coWorkflow) {
    await db.transaction(async (tx) => {
      await tx.insert(approvalWorkflowTemplate).values({
        id: CLM_SEED.workflows.contosoAdmin.id,
        organizationId: co,
        name: CLM_SEED.workflows.contosoAdmin.name,
        status: "ACTIVE",
        createdByUserId: coAdmin,
        createdAt: now(),
        updatedAt: now(),
      });
      await tx.insert(approvalStageTemplate).values({
        id: "stage_tpl_co_admin",
        organizationId: co,
        templateId: CLM_SEED.workflows.contosoAdmin.id,
        position: 1,
        name: "Admin review",
        requiredRole: "ORGANIZATION_ADMIN",
        step: 1,
        allowDelegate: true,
      });
    });
  }

  await db
    .update(approvalStageTemplate)
    .set({
      step: 1,
      dueInDays: 5,
      reminderHoursBefore: 24,
      escalateToRole: "ORGANIZATION_ADMIN",
      allowDelegate: true,
    })
    .where(eq(approvalStageTemplate.id, "stage_tpl_nw_legal"));
  await db
    .update(approvalStageTemplate)
    .set({
      step: 2,
      dueInDays: 5,
      reminderHoursBefore: 24,
      escalateToRole: "ORGANIZATION_ADMIN",
      allowDelegate: true,
    })
    .where(eq(approvalStageTemplate.id, "stage_tpl_nw_finance"));
  await db
    .update(approvalStageTemplate)
    .set({ step: 1, allowDelegate: true })
    .where(eq(approvalStageTemplate.id, "stage_tpl_co_admin"));

  const nwParallel = await db.query.approvalWorkflowTemplate.findFirst({
    where: eq(approvalWorkflowTemplate.id, CLM_SEED.workflows.northwindParallel.id),
  });
  if (!nwParallel) {
    await db.transaction(async (tx) => {
      await tx.insert(approvalWorkflowTemplate).values({
        id: CLM_SEED.workflows.northwindParallel.id,
        organizationId: nw,
        name: CLM_SEED.workflows.northwindParallel.name,
        status: "ACTIVE",
        createdByUserId: nwAdmin,
        createdAt: now(),
        updatedAt: now(),
      });
      await tx.insert(approvalStageTemplate).values([
        {
          id: "stage_tpl_nw_par_legal",
          organizationId: nw,
          templateId: CLM_SEED.workflows.northwindParallel.id,
          position: 1,
          name: "Legal review",
          requiredRole: "LEGAL",
          step: 1,
          dueInDays: 5,
          escalateToRole: "ORGANIZATION_ADMIN",
          allowDelegate: true,
        },
        {
          id: "stage_tpl_nw_par_finance",
          organizationId: nw,
          templateId: CLM_SEED.workflows.northwindParallel.id,
          position: 2,
          name: "Finance review",
          requiredRole: "FINANCE",
          step: 1,
          dueInDays: 5,
          escalateToRole: "ORGANIZATION_ADMIN",
          allowDelegate: true,
        },
        {
          id: "stage_tpl_nw_par_procurement",
          organizationId: nw,
          templateId: CLM_SEED.workflows.northwindParallel.id,
          position: 3,
          name: "Procurement review",
          requiredRole: "PROCUREMENT",
          step: 1,
          dueInDays: 5,
          escalateToRole: "ORGANIZATION_ADMIN",
          allowDelegate: true,
        },
        {
          id: "stage_tpl_nw_par_manager",
          organizationId: nw,
          templateId: CLM_SEED.workflows.northwindParallel.id,
          position: 4,
          name: "Manager review",
          requiredRole: "DEPARTMENT_MANAGER",
          step: 2,
          dueInDays: 3,
          escalateToRole: "ORGANIZATION_ADMIN",
          allowDelegate: true,
        },
      ]);
    });
  }

  const nwValue = await db.query.approvalWorkflowTemplate.findFirst({
    where: eq(approvalWorkflowTemplate.id, CLM_SEED.workflows.northwindValueGate.id),
  });
  if (!nwValue) {
    await db.transaction(async (tx) => {
      await tx.insert(approvalWorkflowTemplate).values({
        id: CLM_SEED.workflows.northwindValueGate.id,
        organizationId: nw,
        name: CLM_SEED.workflows.northwindValueGate.name,
        status: "ACTIVE",
        createdByUserId: nwAdmin,
        createdAt: now(),
        updatedAt: now(),
      });
      await tx.insert(approvalStageTemplate).values([
        {
          id: "stage_tpl_nw_val_legal",
          organizationId: nw,
          templateId: CLM_SEED.workflows.northwindValueGate.id,
          position: 1,
          name: "Legal review",
          requiredRole: "LEGAL",
          step: 1,
          dueInDays: 5,
          allowDelegate: true,
        },
        {
          id: "stage_tpl_nw_val_finance",
          organizationId: nw,
          templateId: CLM_SEED.workflows.northwindValueGate.id,
          position: 2,
          name: "Finance review",
          requiredRole: "FINANCE",
          step: 2,
          conditionJson: JSON.stringify({
            match: "ALL",
            predicates: [{ field: "VALUE_MINOR", op: "GTE", amount: 10_000_000 }],
          }),
          dueInDays: 5,
          escalateToRole: "ORGANIZATION_ADMIN",
          allowDelegate: true,
        },
      ]);
    });
  }
}

export async function seedClmFromEnv(): Promise<void> {
  const config = loadConfig();
  const client = createSqliteClient(config.DATABASE_URL);
  await applySqliteDdl(client);
  const db = createDb(client);
  await seedDatabase(db, config.AUTH_SEED_PASSWORD ?? SEED.defaultPassword);
  await seedClm(db);
}

const invokedDirectly = process.argv[1]?.includes("seed.ts");
if (invokedDirectly) {
  seedClmFromEnv()
    .then(() => {
      console.log("CLM development seed applied. See README for example accounts.");
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Seed failed.");
      process.exit(1);
    });
}
