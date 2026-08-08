// Deterministic capture of the real Weave hero flow → PNGs for the explainer.
// Requires weave-api (groq) + web dev server up, and Postgres seeded (/simulate).
// Run: node tools/video/capture.js   (from repo root, with apps/web playwright installed)
const { chromium } = require("/Users/memo/projects/weave/apps/web/node_modules/@playwright/test");
const path = require("path");

const OUT = "/Users/memo/projects/weave/tools/video/public/demo";
const URL = "http://localhost:3200/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(page, text) {
  await page.fill("textarea", text);
  await page.getByLabel("Envoyer").click();
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1512, height: 944 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea", { timeout: 20000 });
  await sleep(1500);
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());

  // skip onboarding
  try {
    await page.locator("button", { hasText: "Passer" }).first().click({ timeout: 4000 });
  } catch {}
  await sleep(500);

  // 1. emergence
  await send(page, "/simulate");
  await page.getByText("compétences").first().waitFor({ timeout: 20000 });
  await sleep(6000);
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.screenshot({ path: path.join(OUT, "live-01-emerge.png") });

  // 2. ask → answer + provenance
  await send(page, "Comment relancer la synchro bancaire d'un client ?");
  await page.getByText("PROVENANCE", { exact: false }).first().waitFor({ timeout: 25000 });
  await sleep(2500);
  await page.evaluate(() => {
    document.querySelector("nextjs-portal")?.remove();
    (document.querySelector("main") || window).scrollTo?.(0, 99999);
    window.scrollTo(0, 99999);
  });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, "live-02-provenance.png") });

  // 3. tight crop of the provenance panel (memory layers)
  try {
    const panel = page.locator("text=PROVENANCE").locator("xpath=ancestor::div[1]");
    await panel.screenshot({ path: path.join(OUT, "live-03-layers.png") });
  } catch (e) {
    console.log("panel crop skipped:", e.message);
  }

  await browser.close();
  console.log("captured:", ["live-01-emerge", "live-02-provenance", "live-03-layers"].join(", "));
})();
