/**
 * Capture Weave demo screenshots + short screen recording for outreach.
 * Usage (from apps/web): node scripts/capture-demo-media.mjs
 * Env: WEAVE_DEMO_URL (default https://strayeye.com)
 */
import { chromium } from "@playwright/test";
import { mkdir, readdir, unlink } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(WEB_ROOT, "..", "..", "..", "docs", "demo");
const BASE = process.env.WEAVE_DEMO_URL || "https://strayeye.com";
const QS = "?onboarding=off&tour=off";

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
    locale: "fr-FR",
  });
  const page = await context.newPage();

  const shot = async (name, pauseMs = 2500) => {
    await page.waitForTimeout(pauseMs);
    await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  };

  await page.goto(`${BASE}/${QS}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await shot("01-chat.png");

  const textarea = page.getByTestId("chat-composer").locator("textarea");
  await textarea.waitFor({ timeout: 30_000 });
  await textarea.fill("/ask Comment relancer la synchro bancaire ?");
  await page.getByTestId("chat-composer").locator("button[type='submit']").click();
  await page.getByTestId("chat-answer").waitFor({ timeout: 120_000 });
  await shot("02-chat-answer.png");

  await page.goto(
    `${BASE}/competence?name=synchro-bancaire/bancaire-client-relancer-synchro${QS.replace("?", "&")}`,
    { waitUntil: "domcontentloaded", timeout: 60_000 },
  );
  await shot("03-competence.png");

  await page.goto(`${BASE}/agent?name=bancaire-relance${QS.replace("?", "&")}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await shot("04-agent.png");

  await page.goto(`${BASE}/reglages${QS.replace("?", "&")}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await shot("05-reglages.png");

  await page.waitForTimeout(3000);
  await context.close();
  await browser.close();

  const files = await readdir(OUT);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (webm) {
    const src = path.join(OUT, webm);
    const mp4 = path.join(OUT, "weave-demo.mp4");
    execSync(
      `ffmpeg -y -i "${src}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${mp4}"`,
      { stdio: "inherit" },
    );
    await unlink(src);
    console.log(`Video: ${mp4}`);
  }

  console.log(`Screenshots: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
