/**
 * Capture Weave demo screenshots + short screen recording for outreach.
 * Usage (from apps/web): node scripts/capture-demo-media.mjs
 * Env: WEAVE_DEMO_URL, WEAVE_API_KEY (optional Bearer for /weave-api)
 */
import { chromium } from "@playwright/test";
import { mkdir, readdir, unlink, cp } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(WEB_ROOT, "..", "..", "..", "docs", "demo");
const PUBLIC = path.join(WEB_ROOT, "..", "public", "demo");
const BASE = (process.env.WEAVE_DEMO_URL || "https://strayeye.com").replace(/\/$/, "");
const API = `${BASE}/weave-api`;
const PROJECT = process.env.WEAVE_DEMO_PROJECT || "pennylane";
const QS = "?onboarding=off&tour=off";
const API_KEY = process.env.WEAVE_API_KEY || process.env.NEXT_PUBLIC_WEAVE_API_KEY || "";

async function apiGet(pathname) {
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const res = await fetch(`${API}${pathname}`, { headers });
  if (!res.ok) throw new Error(`GET ${pathname} → ${res.status}`);
  return res.json();
}

function pickDemoTargets(skills, agents) {
  const bankSkill =
    skills.find((s) => /relancer.*synchro|synchro.*bancaire/i.test(s.trigger || "")) ||
    skills.find((s) => /bancaire|synchro/i.test(s.name)) ||
    skills[0];
  const bankAgent =
    agents.find((a) => bankSkill && a.skills?.includes(bankSkill.name)) ||
    agents.find((a) => /bancaire|synchro/i.test(a.name)) ||
    agents.find((a) => a.status === "pending") ||
    agents[0];
  return { bankSkill, bankAgent };
}

async function waitForDetail(page, mustInclude) {
  await page.getByText(mustInclude, { exact: false }).first().waitFor({
    state: "visible",
    timeout: 60_000,
  });
  await page.waitForTimeout(1200);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(PUBLIC, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
    locale: "fr-FR",
  });
  const page = await context.newPage();

  const shot = async (name, pauseMs = 2500) => {
    await page.waitForTimeout(pauseMs);
    const file = path.join(OUT, name);
    await page.screenshot({ path: file, fullPage: false });
    await cp(file, path.join(PUBLIC, name));
  };

  await page.goto(`${BASE}/${QS}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await shot("01-chat.png");

  const textarea = page.getByTestId("chat-composer").locator("textarea");
  await textarea.waitFor({ timeout: 30_000 });
  await textarea.fill("/ask Comment relancer la synchro bancaire ?");
  await page.getByTestId("chat-composer").locator("button[type='submit']").click();
  try {
    await page.getByTestId("chat-answer").waitFor({ timeout: 180_000 });
    await shot("02-chat-answer.png");
  } catch {
    console.warn("Chat answer timed out — skipping 02-chat-answer.png");
  }

  const [skills, agents] = await Promise.all([
    apiGet(`/skills?project=${PROJECT}`),
    apiGet(`/agents?project=${PROJECT}`),
  ]);
  const { bankSkill, bankAgent } = pickDemoTargets(skills, agents);
  if (!bankSkill) throw new Error("No skill found for demo capture");
  if (!bankAgent) throw new Error("No agent found for demo capture");

  console.log(`Skill: ${bankSkill.name}`);
  console.log(`Agent: ${bankAgent.name}`);

  const q = QS.replace("?", "&");
  await page.goto(
    `${BASE}/competence?name=${encodeURIComponent(bankSkill.name)}${q}`,
    { waitUntil: "domcontentloaded", timeout: 60_000 },
  );
  await waitForDetail(page, bankSkill.name);
  await shot("03-competence.png");

  await page.goto(
    `${BASE}/agent?name=${encodeURIComponent(bankAgent.name)}${q}`,
    { waitUntil: "domcontentloaded", timeout: 60_000 },
  );
  await waitForDetail(page, bankAgent.name);
  await shot("04-agent.png");

  await page.goto(`${BASE}/reglages${q}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: /réglages|settings/i }).waitFor({ timeout: 30_000 }).catch(() => {});
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
    await cp(mp4, path.join(PUBLIC, "weave-demo.mp4"));
    console.log(`Video: ${mp4}`);
  }

  console.log(`Screenshots: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
