import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@accordiq/auth";
import { isAppError } from "@accordiq/core";
import { ApprovalDetail } from "../../../../components/approvals/approval-detail";
import { getRuntime } from "../../../../lib/runtime";
import { requireActor } from "../../../../lib/session";

export const metadata: Metadata = { title: "Approval" };

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(`/approvals/${id}`);
  const { clm } = await getRuntime();
  let loaded: Awaited<ReturnType<typeof clm.getApproval>>;
  const reviewersByStage: Record<
    string,
    { userId: string; name: string | null; email: string; role: string }[]
  > = {};
  try {
    loaded = await clm.getApproval(actor, id);
    for (const stage of loaded.stages) {
      if (stage.canAct && stage.allowDelegate && !stage.delegatedToUserId) {
        reviewersByStage[stage.id] = await clm.listReviewers(actor, id, stage.id);
      }
    }
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1>Approval request</h1>
      <ApprovalDetail
        requestId={id}
        canWrite={can(actor, "contracts:write")}
        contract={serialize(loaded.contract)}
        request={serialize({
          status: loaded.request.status,
          stale: loaded.request.stale,
          invalidatedReason: loaded.request.invalidatedReason,
          resubmitCount: loaded.request.resubmitCount,
        })}
        stages={serialize(loaded.stages)}
        comments={serialize(loaded.comments)}
        events={serialize(loaded.events)}
        reviewersByStage={serialize(reviewersByStage)}
      />
    </div>
  );
}
