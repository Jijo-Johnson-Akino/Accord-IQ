import { describe, expect, it } from "vitest";
import {
  actionableStageIds,
  canActorDecide,
  evaluateCondition,
  materialSnapshot,
  nextRequestStatus,
  parseCondition,
  reminderDue,
  snapshotsDiffer,
  type EvaluableStage,
} from "./approval-engine";

const facts = {
  valueMinor: 12_500_000,
  category: "MSA",
  department: "OPERATIONS",
  vendorId: "vendor_1",
  overallSeverity: "MEDIUM",
  versionId: "version_1",
};

function stage(
  partial: Partial<EvaluableStage> & Pick<EvaluableStage, "id" | "step">,
): EvaluableStage {
  return {
    status: "PENDING",
    requiredRole: "LEGAL",
    delegatedToUserId: null,
    escalateToRole: null,
    escalatedAt: null,
    ...partial,
  };
}

describe("approval conditions", () => {
  it("includes a stage with no predicates", () => {
    expect(evaluateCondition(facts, parseCondition(null))).toBe(true);
  });

  it("skips finance when value is below the threshold", () => {
    const condition = parseCondition({
      match: "ALL",
      predicates: [{ field: "VALUE_MINOR", op: "GTE", amount: 20_000_000 }],
    });
    expect(evaluateCondition(facts, condition)).toBe(false);
    expect(evaluateCondition({ ...facts, valueMinor: 20_000_000 }, condition)).toBe(true);
  });

  it("fails closed when a conditioned field is missing", () => {
    const condition = parseCondition({
      match: "ALL",
      predicates: [{ field: "RISK", op: "IN", values: ["HIGH"] }],
    });
    expect(evaluateCondition({ ...facts, overallSeverity: null }, condition)).toBe(false);
  });

  it("matches type and department together", () => {
    const condition = parseCondition({
      match: "ALL",
      predicates: [
        { field: "CATEGORY", op: "IN", values: ["MSA", "SOW"] },
        { field: "DEPARTMENT", op: "IN", values: ["OPERATIONS"] },
      ],
    });
    expect(evaluateCondition(facts, condition)).toBe(true);
    expect(evaluateCondition({ ...facts, department: "LEGAL" }, condition)).toBe(false);
  });
});

describe("prerequisite steps", () => {
  const legal = stage({ id: "s1", step: 1, requiredRole: "LEGAL" });
  const finance = stage({ id: "s2", step: 1, requiredRole: "FINANCE" });
  const manager = stage({ id: "s3", step: 2, requiredRole: "DEPARTMENT_MANAGER" });

  it("opens parallel stages on the same step and blocks later steps", () => {
    const ids = actionableStageIds([legal, finance, manager], {
      status: "IN_PROGRESS",
      stale: false,
    });
    expect(ids.sort()).toEqual(["s1", "s2"]);
  });

  it("opens the next step only after every stage in the current step is done", () => {
    const ids = actionableStageIds(
      [{ ...legal, status: "APPROVED" }, { ...finance, status: "APPROVED" }, manager],
      { status: "IN_PROGRESS", stale: false },
    );
    expect(ids).toEqual(["s3"]);
  });

  it("freezes decisions while a reviewer has requested changes", () => {
    const ids = actionableStageIds([{ ...legal, status: "CHANGES_REQUESTED" }, finance], {
      status: "IN_PROGRESS",
      stale: false,
    });
    expect(ids).toEqual([]);
  });

  it("blocks every decision when the request is stale", () => {
    expect(actionableStageIds([legal], { status: "IN_PROGRESS", stale: true })).toEqual([]);
  });
});

describe("authorization and outcomes", () => {
  const legalStage = stage({ id: "s1", step: 1, requiredRole: "LEGAL" });

  it("lets the matching role decide and refuses a different role", () => {
    expect(
      canActorDecide({ userId: "u1", platformRole: null, organizationRole: "LEGAL" }, legalStage),
    ).toBe(true);
    expect(
      canActorDecide({ userId: "u2", platformRole: null, organizationRole: "FINANCE" }, legalStage),
    ).toBe(false);
  });

  it("lets a delegate or org admin decide", () => {
    expect(
      canActorDecide(
        { userId: "u3", platformRole: null, organizationRole: "FINANCE" },
        { ...legalStage, delegatedToUserId: "u3" },
      ),
    ).toBe(true);
    expect(
      canActorDecide(
        { userId: "admin", platformRole: null, organizationRole: "ORGANIZATION_ADMIN" },
        legalStage,
      ),
    ).toBe(true);
  });

  it("rejects the request and requests changes without completing remaining stages", () => {
    const pending = [legalStage, stage({ id: "s2", step: 2, requiredRole: "FINANCE" })];
    expect(nextRequestStatus(pending, "REJECTED")).toBe("REJECTED");
    expect(nextRequestStatus(pending, "CHANGES_REQUESTED")).toBe("CHANGES_REQUESTED");
    expect(nextRequestStatus([{ ...legalStage, status: "APPROVED" }], "APPROVED")).toBe("APPROVED");
  });
});

describe("snapshots and reminders", () => {
  it("treats value, type, department, vendor, risk and version as material", () => {
    const snap = materialSnapshot(facts);
    expect(snapshotsDiffer(snap, snap)).toBe(false);
    expect(snapshotsDiffer(snap, materialSnapshot({ ...facts, valueMinor: 1 }))).toBe(true);
    expect(snapshotsDiffer(null, snap)).toBe(true);
  });

  it("fires a reminder inside the lead window once", () => {
    const due = new Date("2026-10-28T12:00:00Z");
    expect(reminderDue(due, 24, null, new Date("2026-10-27T12:00:00Z"))).toBe(true);
    expect(reminderDue(due, 24, null, new Date("2026-10-26T12:00:00Z"))).toBe(false);
    expect(
      reminderDue(due, 24, new Date("2026-10-27T12:00:00Z"), new Date("2026-10-27T13:00:00Z")),
    ).toBe(false);
  });
});
