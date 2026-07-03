/** Base URL for Playwright page navigation. */
export function e2eWebUrl(): string {
  return process.env.WEAVE_E2E_URL || "http://127.0.0.1:3200";
}

/** Weave API base URL (health, reset, etc.) — same as the browser uses when set. */
export function e2eApiUrl(): string {
  return (
    process.env.WEAVE_E2E_API ||
    process.env.NEXT_PUBLIC_WEAVE_API ||
    "http://127.0.0.1:8787"
  );
}
