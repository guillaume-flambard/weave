import { expect, test } from "@playwright/test";

test("home shows chat shell and slim navigation", async ({ page }) => {
  await page.goto("/?onboarding=off&tour=off");

  await expect(page.getByRole("link", { name: /Weave/i })).toBeVisible();
  await expect(page.getByText("Cognitive Runtime")).toBeVisible();
  await expect(page.getByTestId("chat-composer")).toBeVisible();
  await expect(page.getByRole("link", { name: /Conversation/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Réglages|Settings/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Que voulez-vous faire|What would you like/i })).toBeVisible();
});

test("slash menu appears when typing /", async ({ page }) => {
  await page.goto("/?onboarding=off&tour=off");
  const textarea = page.getByTestId("chat-composer").locator("textarea");
  await textarea.fill("/");
  await expect(page.getByTestId("slash-command-menu")).toBeVisible();
  await expect(page.getByText("/sources")).toBeVisible();
  await expect(page.getByText("/simulate")).toBeVisible();

  await textarea.fill("/sim");
  await expect(page.getByText("/simulate")).toBeVisible();
  await expect(page.getByText("/sources")).toHaveCount(0);

  await textarea.press("Tab");
  await expect(textarea).toHaveValue("/simulate");

  await textarea.fill("/");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("/sources");
});

test("slash sources shows Slack and Notion in thread", async ({ page }) => {
  await page.goto("/?onboarding=off&tour=off");
  await page.getByTestId("chat-composer").locator("textarea").fill("/sources");
  await page.getByTestId("chat-composer").locator("button[type='submit']").click();

  await expect(page.getByRole("main").getByText("Slack", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("main").getByText("Notion", { exact: true })).toBeVisible();
  await expect(page.getByText(/Reconnexion requise|Reconnection required/i)).toHaveCount(0);
});

test("legacy workspace route redirects to chat simulate", async ({ page }) => {
  await page.goto("/espace-de-travail?onboarding=off&tour=off");
  await expect(page).toHaveURL(/cmd=simulate/);
});

test("language switcher toggles UI copy", async ({ page }) => {
  await page.goto("/?onboarding=off&tour=off");
  await expect(page.getByRole("link", { name: "Conversation" })).toBeVisible();

  await page.getByLabel(/langue|language/i).selectOption("en");
  await expect(page.getByRole("link", { name: "Conversation" })).toBeVisible({ timeout: 10_000 });

  await page.getByLabel(/langue|language/i).selectOption("fr");
  await expect(page.getByRole("link", { name: "Conversation" })).toBeVisible({ timeout: 10_000 });
});

test("settings page exposes access matrix", async ({ page }) => {
  await page.goto("/reglages?onboarding=off&tour=off");
  await expect(page.getByRole("heading", { name: /Réglages|Settings/i })).toBeVisible();
  await expect(page.getByText(/Identifiant|Identifier/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Retour à la conversation|Back to conversation/i })).toBeVisible();
});

test("governance route opens govern summary in chat", async ({ page }) => {
  await page.goto("/gouvernance?onboarding=off&tour=off");
  await expect(page).toHaveURL(/cmd=govern/);
  await expect(page.getByText(/Sources connectées|Connected sources/i)).toBeVisible({ timeout: 10_000 });
});
