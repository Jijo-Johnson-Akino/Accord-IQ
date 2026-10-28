import { expect, test } from "@playwright/test";

const ORIGIN = "http://localhost:3000";
const PASSWORD = "Dev-only-passw0rd!";

test("viewer cannot store integration credentials", async ({ request }) => {
  const login = await request.post("/api/auth/sign-in/email", {
    headers: { origin: ORIGIN, "content-type": "application/json" },
    data: { email: "viewer@northwind.example", password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const denied = await request.post("/api/integrations/credentials", {
    headers: { origin: ORIGIN, "content-type": "application/json" },
    data: {
      kind: "CRM",
      provider: "hubspot",
      apiKey: "sk-live-not-for-browser",
      webhookSecret: "org-webhook-secret-16",
    },
  });
  expect(denied.status()).toBe(403);
  const body = await denied.text();
  expect(body).not.toContain("sk-live-not-for-browser");
});

test("contoso session cannot read the Northwind seed contract", async ({ request }) => {
  const login = await request.post("/api/auth/sign-in/email", {
    headers: { origin: ORIGIN, "content-type": "application/json" },
    data: { email: "admin@contoso.example", password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const missing = await request.get("/api/contracts/contract_nw_msa");
  expect(missing.status()).toBe(404);
});

test("finance transaction export is forbidden to viewers", async ({ request }) => {
  const login = await request.post("/api/auth/sign-in/email", {
    headers: { origin: ORIGIN, "content-type": "application/json" },
    data: { email: "viewer@northwind.example", password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const denied = await request.get("/api/finance/export?kind=transactions");
  expect(denied.status()).toBe(403);
});
