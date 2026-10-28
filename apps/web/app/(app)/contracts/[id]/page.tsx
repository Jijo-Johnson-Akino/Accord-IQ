import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@accordiq/auth";
import { isAppError, parsePage } from "@accordiq/core";
import { ContractApprovals } from "../../../../components/contracts/contract-approvals";
import { ContractDetail } from "../../../../components/contracts/contract-detail";
import { ContractIntelligence } from "../../../../components/contracts/contract-intelligence";
import { ContractFinance } from "../../../../components/finance/contract-finance";
import { ContractMonitoring } from "../../../../components/contracts/contract-monitoring";
import { ContractRisk } from "../../../../components/contracts/contract-risk";
import { ContractSigning } from "../../../../components/contracts/contract-signing";
import { getRuntime } from "../../../../lib/runtime";
import { requireActor } from "../../../../lib/session";

export const metadata: Metadata = { title: "Contract" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(`/contracts/${id}`);
  const { clm } = await getRuntime();
  let loaded: {
    detail: Awaited<ReturnType<typeof clm.getContract>>;
    vendors: { id: string; name: string }[];
    contracts: { id: string; title: string }[];
    intelligence: Awaited<ReturnType<typeof clm.getContractIntelligence>>;
    assessments: Awaited<ReturnType<typeof clm.listRiskAssessments>>;
    latestRisk: Awaited<ReturnType<typeof clm.getRiskAssessment>> | null;
    workflows: Awaited<ReturnType<typeof clm.listWorkflows>>;
    approvals: Awaited<ReturnType<typeof clm.listApprovals>>;
    openApproval: Awaited<ReturnType<typeof clm.getApproval>> | null;
    envelopes: Awaited<ReturnType<typeof clm.listEnvelopes>>;
    signatureContext: Awaited<ReturnType<typeof clm.getSignatureContext>>;
    obligations: Awaited<ReturnType<typeof clm.listObligations>>;
    renewal: Awaited<ReturnType<typeof clm.getRenewalWatch>>;
    finance: Awaited<ReturnType<typeof clm.getContractFinance>>;
  };
  try {
    const [
      detail,
      vendors,
      contracts,
      intelligence,
      assessments,
      workflows,
      approvals,
      envelopes,
      signatureContext,
      obligations,
      renewal,
      finance,
    ] = await Promise.all([
      clm.getContract(actor, id),
      clm.listVendors(actor, parsePage(new URLSearchParams("limit=100"))),
      clm.listContracts(actor, parsePage(new URLSearchParams("limit=100"))),
      clm.getContractIntelligence(actor, id),
      clm.listRiskAssessments(actor, id),
      clm.listWorkflows(actor),
      clm.listApprovals(actor, parsePage(new URLSearchParams("limit=20")), { contractId: id }),
      clm.listEnvelopes(actor, id),
      clm.getSignatureContext(actor, id),
      clm.listObligations(actor, parsePage(new URLSearchParams("limit=100")), { contractId: id }),
      clm.getRenewalWatch(actor, id),
      clm.getContractFinance(actor, id),
    ]);
    const latest = assessments[0];
    const openRow = approvals.items.find(
      (row) => row.status === "IN_PROGRESS" || row.status === "CHANGES_REQUESTED",
    );
    loaded = {
      detail,
      vendors: vendors.items.map((row) => ({ id: row.id, name: row.name })),
      contracts: contracts.items.map((row) => ({ id: row.id, title: row.title })),
      intelligence,
      assessments,
      latestRisk: latest ? await clm.getRiskAssessment(actor, latest.id) : null,
      workflows,
      approvals,
      openApproval: openRow ? await clm.getApproval(actor, openRow.id) : null,
      envelopes,
      signatureContext,
      obligations,
      renewal,
      finance,
    };
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const canWrite = can(actor, "contracts:write");
  return (
    <>
      <ContractDetail
        canWrite={canWrite}
        vendors={loaded.vendors}
        contracts={loaded.contracts}
        detail={serialize({
          contract: loaded.detail.contract,
          versions: loaded.detail.versions,
          documents: loaded.detail.documents,
          parties: loaded.detail.parties,
          relations: loaded.detail.relations,
        })}
      />
      <div className="mx-auto max-w-5xl">
        <ContractApprovals
          contractId={id}
          canWrite={canWrite}
          workflows={serialize(loaded.workflows)}
          requests={serialize(loaded.approvals.items)}
          openStages={serialize(loaded.openApproval?.stages ?? null)}
        />
        <ContractFinance
          contractId={id}
          currency={loaded.detail.contract.currency}
          canWriteFinance={can(actor, "finance:write")}
          canWriteContracts={canWrite}
          insights={serialize(loaded.finance.report)}
          milestones={serialize(loaded.finance.milestones)}
          transactions={serialize(loaded.finance.transactions)}
          escalations={serialize(loaded.finance.escalations)}
          savings={serialize(loaded.finance.savings)}
        />
        <ContractMonitoring
          contractId={id}
          canWrite={canWrite}
          userId={actor.userId}
          obligations={serialize(loaded.obligations.items)}
          watch={
            loaded.renewal.watch
              ? serialize({
                  ...loaded.renewal.watch,
                  contractTitle: loaded.renewal.contract.title,
                  contractStatus: loaded.renewal.contract.status,
                })
              : null
          }
          workflows={serialize(
            loaded.workflows.map((workflow) => ({
              id: workflow.id,
              name: workflow.name,
              status: workflow.status,
            })),
          )}
        />
        <ContractSigning
          contractId={id}
          canSend={can(actor, "signatures:send")}
          parties={serialize(loaded.detail.parties)}
          context={serialize(loaded.signatureContext)}
          envelopes={serialize(loaded.envelopes)}
        />
        <ContractRisk
          contractId={id}
          canAssess={canWrite}
          canReview={can(actor, "risk:review")}
          assessments={serialize(loaded.assessments)}
          latest={serialize(loaded.latestRisk)}
        />
        <ContractIntelligence
          contractId={id}
          documents={loaded.detail.documents.map((doc) => ({ id: doc.id, fileName: doc.fileName }))}
          canWrite={canWrite}
          initial={
            serialize(loaded.intelligence) as Parameters<typeof ContractIntelligence>[0]["initial"]
          }
        />
      </div>
    </>
  );
}
