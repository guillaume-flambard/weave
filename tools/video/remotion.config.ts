import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setEntryPoint("./src/index.ts");

// Sandbox blocks Remotion's Chrome auto-download — reuse the local Playwright shell.
Config.setBrowserExecutable(
  process.env.HOME +
    "/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"
);
