import { expect, test } from "@playwright/test";
import { e2eApiUrl } from "../../lib/e2e-env";

const API = e2eApiUrl();
const PROJECT = process.env.WEAVE_E2E_PROJECT || "pennylane";

async function apiReady(request: import("@playwright/test").APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${API}/health`, { timeout: 8000 })).ok();
  } catch {
    return false;
  }
}

test.describe("Hero demo (chat)", () => {
  test("simulate → skill emerges → ask", async ({ page, request }) => {
    test.setTimeout(240_000);

    test.skip(!(await apiReady(request)), `weave-api not reachable at ${API}`);

    await request.post(`${API}/org/load`, { data: { org: PROJECT } });
    await page.goto("/?onboarding=off&tour=off&cmd=simulate");

    await expect(page.getByTestId("ingestion-live")).toBeVisible({ timeout: 30_000 });

    // Wait for at least one skill (progress counter or pipeline trace)
    await expect
      .poll(
        async () => {
          const res = await request.get(`${API}/stats?project=${PROJECT}`);
          if (!res.ok()) return 0;
          const stats = await res.json();
          return Array.isArray(stats.skills) ? stats.skills.length : 0;
        },
        { timeout: 180_000, intervals: [3000] },
      )
      .toBeGreaterThan(0);

    const textarea = page.getByTestId("chat-composer").locator("textarea");
    await textarea.fill("/ask Comment relancer la synchro bancaire ?");
    await page.getByTestId("chat-composer").locator("button[type='submit']").click();

    await expect(page.getByTestId("chat-answer")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("chat-answer")).toContainText(/synchro|bancaire|stub|answer|oauth|bridge/i);
  });
});
