import { describe, expect, it } from "vitest";
import { emailCatalog, esignCatalog, storageCatalog, unwiredCatalog } from "./catalog";

describe("integration catalog", () => {
  it("marks console email as test-only and never connected", () => {
    const card = emailCatalog({ driver: "console" });
    expect(card.connected).toBe(false);
    expect(card.testOnly).toBe(true);
    expect(card.state).toBe("TEST_ONLY");
    expect(card.available).toBe(true);
  });

  it("marks Resend as connected only when that driver is selected", () => {
    const card = emailCatalog({ driver: "resend" });
    expect(card.connected).toBe(true);
    expect(card.state).toBe("CONNECTED");
    expect(card.provider).toBe("resend");
  });

  it("does not claim e-sign is connected when the provider is none", () => {
    const card = esignCatalog({
      provider: "none",
      available: false,
      testOnly: false,
      setup: ["Set ESIGN_PROVIDER"],
    });
    expect(card.connected).toBe(false);
    expect(card.state).toBe("NOT_CONFIGURED");
    expect(card.available).toBe(false);
  });

  it("keeps CRM unavailable even when a secret is stored", () => {
    const card = unwiredCatalog({
      kind: "CRM",
      title: "CRM",
      description: "Future CRM adapter.",
      credentialConfigured: true,
      provider: "hubspot",
    });
    expect(card.connected).toBe(false);
    expect(card.available).toBe(false);
    expect(card.state).toBe("UNAVAILABLE");
    expect(card.credentialConfigured).toBe(true);
    expect(card.warning).toMatch(/not connected/i);
  });

  it("does not claim S3 is connected", () => {
    const card = storageCatalog({ driver: "s3" });
    expect(card.connected).toBe(false);
    expect(card.available).toBe(false);
    expect(card.state).toBe("NOT_CONFIGURED");
  });
});
