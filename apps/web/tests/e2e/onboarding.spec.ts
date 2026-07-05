import { expect, test } from "@playwright/test";

const ONBOARDING_KEY = "weave_onboarding_state";
const LEGACY_KEY = "weave_onboarding_done";

async function clearOnboarding(page: import("@playwright/test").Page) {
  await page.addInitScript(
    ([stateKey, legacyKey]) => {
      localStorage.removeItem(stateKey);
      localStorage.removeItem(legacyKey);
    },
    [ONBOARDING_KEY, LEGACY_KEY] as const,
  );
}

test.describe("Onboarding chat", () => {
  test("nouvel utilisateur voit l'étape intro", async ({ page }) => {
    await clearOnboarding(page);
    await page.goto("/?tour=off");

    await expect(page.getByTestId("onboarding-step-intro")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Bienvenue dans Weave|Welcome to Weave/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Commencer|Get started/i })).toBeVisible();
  });

  test("Passer termine l'introduction", async ({ page }) => {
    await clearOnboarding(page);
    await page.goto("/?tour=off");

    await expect(page.getByTestId("onboarding-step-intro")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Passer$|^Skip$/i }).click();

    await expect(page.getByTestId("onboarding-step-intro")).toHaveCount(0, { timeout: 10_000 });
    await expect(
      page.getByText(/Introduction passée|Introduction skipped/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("?onboarding=off masque l'introduction", async ({ page }) => {
    await clearOnboarding(page);
    await page.goto("/?onboarding=off&tour=off");

    await expect(page.getByTestId("onboarding-step-intro")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Que voulez-vous faire|What would you like/i })).toBeVisible();
  });

  test("?onboarding=restart relance depuis intro", async ({ page }) => {
    await page.addInitScript(
      ([stateKey]) => {
        localStorage.setItem(
          stateKey,
          JSON.stringify({
            v: 1,
            phase: "done",
            stepIndex: 6,
            stepId: "govern",
            awaitingSimulate: false,
            updatedAt: new Date().toISOString(),
          }),
        );
      },
      [ONBOARDING_KEY] as const,
    );

    await page.goto("/?onboarding=restart&tour=off");
    await expect(page.getByTestId("onboarding-step-intro")).toBeVisible({ timeout: 15_000 });
  });

  test("persistance après refresh — reste à l'étape sources", async ({ page }) => {
    await page.goto("/?tour=off");
    await page.evaluate(
      ([stateKey, legacyKey]) => {
        localStorage.removeItem(stateKey);
        localStorage.removeItem(legacyKey);
      },
      [ONBOARDING_KEY, LEGACY_KEY] as const,
    );
    await page.reload();

    await expect(page.getByTestId("onboarding-step-intro")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Commencer|Get started/i }).click();

    await expect(page.getByTestId("onboarding-step-sources")).toBeVisible({ timeout: 15_000 });

    await page.waitForFunction(
      (key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        try {
          const s = JSON.parse(raw) as { stepIndex?: number; stepId?: string };
          return s.stepIndex === 1 && s.stepId === "sources";
        } catch {
          return false;
        }
      },
      ONBOARDING_KEY,
    );

    await page.reload();
    await expect(page.getByTestId("onboarding-step-sources")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Connecter vos sources|Connect your sources/i })).toBeVisible();
  });

  test("intro → sources affiche Slack et Notion", async ({ page }) => {
    await clearOnboarding(page);
    await page.goto("/?tour=off");

    await expect(page.getByTestId("onboarding-step-intro")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Commencer|Get started/i }).click();
    await expect(page.getByTestId("onboarding-step-sources")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Connecter les sources|Connect sources/i }).click();

    await expect(page.getByRole("main").getByText("Slack", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("main").getByText("Notion", { exact: true })).toBeVisible();
    await expect(page.getByTestId("onboarding-step-simulate")).toBeVisible({ timeout: 10_000 });
  });
});
