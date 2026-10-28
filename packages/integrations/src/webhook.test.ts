import { describe, expect, it } from "vitest";
import { signIntegrationWebhook } from "./hmac";
import { verifyIntegrationWebhook } from "./webhook";

const SECRET = "org-webhook-secret-16";
const BODY = JSON.stringify({ type: "contact.updated" });

describe("integration webhooks", () => {
  it("accepts a valid HMAC and rejects a bad signature", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const eventId = "evt_1";
    const signature = signIntegrationWebhook({
      secret: SECRET,
      timestamp,
      eventId,
      rawBody: BODY,
    });
    const ok = verifyIntegrationWebhook({
      secret: SECRET,
      rawBody: BODY,
      headers: {
        signature,
        timestamp,
        eventId,
        organizationSlug: "northwind",
      },
    });
    expect(ok.eventId).toBe(eventId);

    expect(() =>
      verifyIntegrationWebhook({
        secret: SECRET,
        rawBody: BODY,
        headers: {
          signature: "v1=deadbeef",
          timestamp,
          eventId,
          organizationSlug: "northwind",
        },
      }),
    ).toThrow(/invalid/i);
  });

  it("rejects a timestamp outside the window", () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 10_000);
    const eventId = "evt_stale";
    const signature = signIntegrationWebhook({
      secret: SECRET,
      timestamp,
      eventId,
      rawBody: BODY,
    });
    expect(() =>
      verifyIntegrationWebhook({
        secret: SECRET,
        rawBody: BODY,
        headers: { signature, timestamp, eventId, organizationSlug: "northwind" },
        toleranceSeconds: 300,
      }),
    ).toThrow(/window/i);
  });
});
