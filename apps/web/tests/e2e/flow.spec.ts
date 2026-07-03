import { expect, test, type Page } from "@playwright/test";
import { e2eApiUrl } from "../../lib/e2e-env";

// Full user journey across the wired pages — the demo path shown to PennyLane.
// Console errors, page crashes and failed API calls anywhere along the flow
// fail the test with the collected details.

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

test.describe("Parcours démo complet", () => {
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

    // 1 — workspace: simulate → skill emerges
    step = "reset+load /espace-de-travail";
    await request.post(`${API}/reset?project=${PROJECT}`);
    await page.goto("/espace-de-travail?tour=off");
    await expect(page.locator("button[data-tour='simulate']")).toBeEnabled({ timeout: 30_000 });

    step = "simulate";
    await page.locator("button[data-tour='simulate']").click();
    await expect(page.getByTestId("skill-item").first()).toBeVisible({ timeout: 180_000 });

    // 2 — ask on workspace
    step = "ask workspace";
    const askPanel = page.getByTestId("ask-panel");
    await askPanel.locator("input").fill("Comment relancer la synchro bancaire ?");
    await askPanel.getByRole("button", { name: /demander/i }).click();
    await expect(page.getByTestId("ask-answer")).toBeVisible({ timeout: 120_000 });

    // 3 — vue d'ensemble
    step = "nav vue-d-ensemble";
    await page.getByRole("link", { name: "Vue d'ensemble" }).click();
    await expect(page.getByRole("heading", { name: /Vue d'ensemble/i })).toBeVisible({ timeout: 15_000 });

    // 4 — interroger la mémoire
    step = "nav interroger";
    await page.getByRole("link", { name: "Interroger" }).click();
    await expect(page.getByRole("heading", { name: /Interroger la mémoire/i })).toBeVisible({ timeout: 15_000 });
    step = "ask interroger";
    const askInput = page.locator("input[placeholder*='synchro bancaire']");
    await askInput.fill("Comment relancer la synchro bancaire d'un client ?");
    await askInput.press("Enter");
    await expect(
      page.getByText(/Réponse composée|Aucune mémoire pertinente|couches mémoire/i).first(),
    ).toBeVisible({ timeout: 120_000 });

    // 5 — gouvernance (approve if pending)
    step = "nav gouvernance";
    await page.getByRole("link", { name: "Gouvernance" }).click();
    await expect(page.getByRole("heading", { name: /Gouvernance/i })).toBeVisible({ timeout: 15_000 });

    // 6 — sources
    step = "nav sources";
    await page.getByRole("link", { name: "Sources" }).click();
    await expect(page.getByText(/Connecter vos sources/i)).toBeVisible({ timeout: 15_000 });

    // 7 — competence + agent detail (deep links)
    step = "page competence";
    await page.goto("/competence");
    await expect(page.getByText(/Compétence|compétence|Déclencheur/i).first()).toBeVisible({ timeout: 15_000 });

    step = "page agent";
    await page.goto("/agent");
    await expect(page.getByText(/agent|Agent/i).first()).toBeVisible({ timeout: 15_000 });
    const approve = page.getByRole("button", { name: /^Approuver$/ }).first();
    if (await approve.isVisible().catch(() => false)) {
      step = "approve agent";
      await approve.click();
      await expect(page.getByText(/actif/i).first()).toBeVisible({ timeout: 15_000 });
    }

    await page.waitForTimeout(1000);
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
  });
});
