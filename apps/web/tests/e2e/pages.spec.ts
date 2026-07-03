import { expect, test, type Page } from "@playwright/test";

const ROUTES: { path: string; mustSee: RegExp }[] = [
  { path: "/?onboarding=off&tour=off", mustSee: /Que voulez-vous faire|What would you like/i },
  { path: "/reglages?onboarding=off&tour=off", mustSee: /Réglages|Settings/i },
  { path: "/competence", mustSee: /Compétence|compétence|Skill/i },
  { path: "/agent", mustSee: /Agent|agent/i },
  { path: "/connecter-les-sources?onboarding=off&tour=off", mustSee: /Sources connectées|Connected sources|Slack/i },
  { path: "/gouvernance?onboarding=off&tour=off", mustSee: /Sources connectées|Connected sources/i },
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
    await page.goto(path);
    await expect(page.getByText(mustSee).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
  });

  test(`page ${path} renders clean (mobile 375)`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const issues = watch(page);
    await page.goto(path);
    await expect(page.getByText(mustSee).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "horizontal overflow px").toBeLessThanOrEqual(0);
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
  });
}

test("cross-page links resolve (no 404)", async ({ page }) => {
  await page.goto("/?onboarding=off&tour=off");
  const hrefs = await page.$$eval("a[href^='/']", (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
  for (const href of hrefs) {
    const res = await page.request.get(href);
    expect(res.status(), `link ${href}`).toBeLessThan(400);
  }
});
