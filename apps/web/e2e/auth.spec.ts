import { expect, test } from "@playwright/test";
import { signInWithForm, waitForSignInForm } from "./helpers";

test("health is public", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
});

test("unauthenticated contracts redirect to login", async ({ page }) => {
  await page.goto("/contracts");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("invalid credentials stay on login without leaking internals", async ({ page }) => {
  const response = await signInWithForm(page, "nobody@example.invalid", "wrong-password-value");
  expect(response.ok()).toBeFalsy();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page.getByText("wrong-password-value")).toHaveCount(0);
  await expect(page.getByText("nobody@example.invalid")).toHaveCount(0);
});

test("legal can sign in and reach Overview", async ({ page }) => {
  const response = await signInWithForm(page, "legal@northwind.example");
  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page).toHaveURL(/\/dashboard/);
});

test("login offers a create-account path", async ({ page }) => {
  await page.goto("/login");
  await waitForSignInForm(page);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await expect(page.getByLabel("Organization name")).toBeVisible();
});

test("new account opens its own workspace", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/signup");
  await expect(page.locator("form[data-ready='true']")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Full name").fill("Casey Founder");
  await page.getByLabel("Organization name").fill(`Harbor ${stamp}`);
  await page.getByLabel("Email").fill(`casey.founder.${stamp}@example.test`);
  await page.locator('input[name="password"]').fill("Signup-passw0rd!");
  await page.locator('input[name="confirm"]').fill("Signup-passw0rd!");
  await page.locator("form[data-ready='true']").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
  });
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 20_000,
  });
});

test("mobile viewport keeps sign-in usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await waitForSignInForm(page);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
