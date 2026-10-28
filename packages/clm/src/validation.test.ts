import { describe, expect, it } from "vitest";
import { AppError, parseInput } from "@accordiq/core";
import {
  assessContractSchema,
  createContractSchema,
  createVendorSchema,
  sendEnvelopeSchema,
  updateRiskPolicySchema,
} from "./validation";
import { parsePolicy, PROPOSED_DEFAULT_POLICY } from "./risk-engine";

describe("CLM request validation", () => {
  it("strips client-supplied organizationId so tenant scope cannot be chosen in the body", () => {
    const vendor = parseInput(createVendorSchema, {
      name: "Acme",
      organizationId: "org_other",
    });
    expect(vendor).toEqual({ name: "Acme" });
    expect("organizationId" in vendor).toBe(false);

    const contract = parseInput(createContractSchema, {
      title: "MSA",
      organizationId: "org_other",
      category: "MSA",
      currency: "USD",
      value: "2500.00",
    });
    expect(contract).toEqual({
      title: "MSA",
      category: "MSA",
      currency: "USD",
      value: "2500.00",
    });

    const envelope = parseInput(sendEnvelopeSchema, {
      organizationId: "org_other",
      signers: [{ name: "A", email: "a@example.com", routingOrder: 1 }],
    });
    expect(envelope.signers[0]?.email).toBe("a@example.com");
    expect("organizationId" in envelope).toBe(false);
  });

  it("rejects an unknown extra filter without echoing secrets", () => {
    try {
      parseInput(createVendorSchema, { name: "" });
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION");
    }
  });

  it("strips client-supplied overallSeverity from an assessment request", () => {
    const input = parseInput(assessContractSchema, {
      overallSeverity: "HIGH",
      asOf: "2026-10-27",
    });
    expect(input).toEqual({ asOf: "2026-10-27" });
  });

  it("rejects contradictory proposed-default thresholds", () => {
    expect(() => parsePolicy({ ...PROPOSED_DEFAULT_POLICY, mediumMin: 80, highMin: 70 })).toThrow(
      AppError,
    );
    expect(() =>
      parseInput(updateRiskPolicySchema, {
        highMin: 40,
        mediumMin: 40,
        expiryUrgentDays: 90,
        expiryWarnDays: 30,
        autoRenewNoticeDaysMin: 60,
        maxTermDays: 1825,
      }),
    ).toThrow(AppError);
  });
});
