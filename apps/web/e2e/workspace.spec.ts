import { expect, test } from "@playwright/test";
import { signInWithSession } from "./helpers";

test("integrations do not claim unwired providers are connected", async ({ page }) => {
  await signInWithSession(page, "legal@northwind.example");
  await page.goto("/integrations", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Email", exact: true })).toBeVisible();
  await expect(page.getByText("Test only").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "CRM", exact: true })).toBeVisible();
  await expect(page.getByText("Not configured").first()).toBeVisible();
  await expect(page.getByText("No adapter is wired.").first()).toBeVisible();
});

test("settings expose notification preferences and skip-link target", async ({ page }) => {
  await signInWithSession(page, "legal@northwind.example");
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "In-app for APPROVAL_REMINDER" })).toBeVisible();
  await expect(page.getByText("email test only")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeAttached();
});
