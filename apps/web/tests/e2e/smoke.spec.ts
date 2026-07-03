import { expect, test } from "@playwright/test";

test("dashboard smoke loads and exposes core actions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: /Weave/i })).toBeVisible();
  await expect(page.getByText("Cognitive Runtime")).toBeVisible();
  await expect(page.locator("button[data-tour='simulate']")).toBeVisible();
  await expect(page.getByRole("button", { name: /réinitialiser/i })).toBeVisible();
  await expect(page.getByTestId("feed-panel")).toBeVisible();
  await expect(page.getByTestId("memory-panel")).toBeVisible();
  await expect(page.getByTestId("skills-panel")).toBeVisible();
  await expect(page.getByTestId("ask-panel")).toBeVisible();
  await expect(page.getByRole("link", { name: "Vue d'ensemble" })).toBeVisible();
  await expect(page.locator("input[placeholder*='Posez une question']")).toBeVisible();
});
