import { expect, test, type Page } from "@playwright/test";
import { e2eApiUrl } from "../../lib/e2e-env";

/**
 * @deprecated Legacy workspace UI removed — use hero.spec.ts (chat-first).
 * Kept as reference; skipped until rewritten for chat blocks.
 */
test.describe.skip("Parcours démo complet (legacy workspace)", () => {
  const API = e2eApiUrl();
  const PROJECT = process.env.WEAVE_E2E_PROJECT || "pennylane";

  type Issue = { at: string; kind: string; detail: string };

  function watch(page: Page, issues: Issue[], at: () => string) {
    page.on("console", (msg) => {
      if (msg.type() === "error") issues.push({ at: at(), kind: "console", detail: msg.text().slice(0, 300) });
    });
    page.on("pageerror", (err) => issues.push({ at: at(), kind: "pageerror", detail: String(err).slice(0, 300) }));
    page.on("response", (res) => {
      const url = res.url();
      if ((url.includes("127.0.0.1") || url.includes("localhost")) && res.status() >= 400) {
        issues.push({ at: at(), kind: `http ${res.status()}`, detail: url.slice(0, 200) });
      }
    });
  }

  test("simulate → emergence → ask → pages liées", async ({ page, request }) => {
    test.setTimeout(300_000);
    let apiOk = false;
    try {
      apiOk = (await request.get(`${API}/health`, { timeout: 8000 })).ok();
    } catch { /* down */ }
    test.skip(!apiOk, `weave-api not reachable at ${API}`);

    const issues: Issue[] = [];
    let step = "start";
    watch(page, issues, () => step);

    step = "reset+load /espace-de-travail";
    await request.post(`${API}/reset?project=${PROJECT}`);
    await page.goto("/espace-de-travail?tour=off");
    await expect(page.locator("button[data-tour='simulate']")).toBeEnabled({ timeout: 30_000 });

    step = "simulate";
    await page.locator("button[data-tour='simulate']").click();
    await expect(page.getByTestId("skill-item").first()).toBeVisible({ timeout: 180_000 });

    step = "ask workspace";
    const askPanel = page.getByTestId("ask-panel");
    await askPanel.locator("input").fill("Comment relancer la synchro bancaire ?");
    await askPanel.getByRole("button", { name: /demander/i }).click();
    await expect(page.getByTestId("ask-answer")).toBeVisible({ timeout: 120_000 });

    await page.waitForTimeout(1000);
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
  });
});
