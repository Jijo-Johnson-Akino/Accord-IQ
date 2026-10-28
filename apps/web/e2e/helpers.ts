import { expect, type Page, type Response } from "@playwright/test";

export const ORIGIN = "http://localhost:3000";
export const SEED_PASSWORD = "Dev-only-passw0rd!";

export async function waitForSignInForm(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("form[data-ready='true']")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
}

export async function signInWithForm(
  page: Page,
  email: string,
  password = SEED_PASSWORD,
): Promise<Response> {
  await page.goto("/login");
  await waitForSignInForm(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const pending = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-in/email") && response.request().method() === "POST",
    { timeout: 20_000 },
  );
  await page.locator("form[data-ready='true']").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  return pending;
}

/** Session cookie via the same browser context, then render a protected page. */
export async function signInWithSession(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: ORIGIN, "content-type": "application/json" },
    data: { email, password: SEED_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 20_000,
  });
}
