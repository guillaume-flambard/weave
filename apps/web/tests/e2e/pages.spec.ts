import { expect, test, type Page } from "@playwright/test";

// Every screen of the demo must load without console errors, page crashes,
// or failed same-origin/API requests — desktop and mobile.

const ROUTES: { path: string; mustSee: RegExp }[] = [
  { path: "/", mustSee: /Cognitive Runtime/i },
  { path: "/vue-d-ensemble", mustSee: /Vue d'ensemble/i },
  { path: "/interroger-la-memoire", mustSee: /Interroger la mémoire/i },
  { path: "/competence", mustSee: /Compétence|compétence/i },
  { path: "/agent", mustSee: /Agent|agent/i },
  { path: "/connecter-les-sources", mustSee: /Connecter vos sources/i },
  { path: "/gouvernance", mustSee: /Gouvernance/i },
];

type Issue = { kind: string; detail: string };

function watch(page: Page): Issue[] {
  const issues: Issue[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") issues.push({ kind: "console", detail: msg.text().slice(0, 300) });
  });
  page.on("pageerror", (err) => issues.push({ kind: "pageerror", detail: String(err).slice(0, 300) }));
  page.on("response", (res) => {
    const url = res.url();
    const local = url.includes("127.0.0.1") || url.includes("localhost");
    if (local && res.status() >= 400) issues.push({ kind: `http ${res.status()}`, detail: url.slice(0, 200) });
  });
  return issues;
}

for (const { path, mustSee } of ROUTES) {
  test(`page ${path} renders clean (desktop)`, async ({ page }) => {
    const issues = watch(page);
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}tour=off`);
    await expect(page.getByText(mustSee).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200); // let SSE/fetches settle
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
  });

  test(`page ${path} renders clean (mobile 375)`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const issues = watch(page);
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}tour=off`);
    await expect(page.getByText(mustSee).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    // no horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "horizontal overflow px").toBeLessThanOrEqual(0);
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
  });
}

test("cross-page links resolve (no 404)", async ({ page }) => {
  await page.goto("/?tour=off");
  const hrefs = await page.$$eval("a[href^='/']", (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
  for (const href of hrefs) {
    const res = await page.request.get(href);
    expect(res.status(), `link ${href}`).toBeLessThan(400);
  }
});
