import { expect, test } from "@playwright/test";
import { e2eApiUrl } from "../../lib/e2e-env";

const API = e2eApiUrl();
const PROJECT = process.env.WEAVE_E2E_PROJECT || "pennylane";

async function apiReady(request: import("@playwright/test").APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${API}/health`, { timeout: 8000 });
    return res.ok();
  } catch {
    return false;
  }
}

test.describe("Hero demo (API)", () => {
  test("simulate → skill emerges → ask", async ({ page, request }) => {
    test.setTimeout(240_000);

    if (!(await apiReady(request))) {
      test.skip(true, `weave-api not reachable at ${API}`);
    }

    await request.post(`${API}/reset?project=${PROJECT}`);
    await page.goto("/espace-de-travail?tour=off");

    const simulate = page.locator("button[data-tour='simulate']");
    await expect(simulate).toBeVisible({ timeout: 15_000 });
    await expect(simulate).toBeEnabled({ timeout: 30_000 });

    await simulate.click();

    await expect(page.getByTestId("skills-panel").locator("[data-testid='skill-item']").first()).toBeVisible({
      timeout: 180_000,
    });

    const askPanel = page.getByTestId("ask-panel");
    await askPanel.locator("input").fill("Comment relancer la synchro bancaire ?");
    await askPanel.getByRole("button", { name: /demander/i }).click();

    const answer = page.getByTestId("ask-answer");
    await expect(answer).toBeVisible({ timeout: 120_000 });
    await expect(answer).toContainText(/synchro|bancaire|oauth|bridge/i);
  });
});
