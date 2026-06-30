import { defineConfig, devices } from "@playwright/test";
import { baseURL, maxDiffPixelRatio } from "./qaConfig";

// plugin-update visual + functional QA suite. Determinism is the priority:
// single worker, no parallelism, animations disabled, fixed viewport — so a
// screenshot diff reflects a real regression, not render jitter.
export default defineConfig({
  testDir: __dirname,
  // Committed baselines live here (referenced by SKILL.md + .gitignore).
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}{ext}",
  fullyParallel: false,
  workers: 1,
  // Integration tests against a live, often-uncached staging origin (TTFB can
  // swing several seconds). Retries absorb transient env latency: a flake passes
  // on retry; a real regression fails all attempts. (Not masking test bugs —
  // the env is the variable.)
  retries: 2,
  reporter: [["list"]],
  timeout: 90_000,
  use: {
    baseURL,
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    userAgent: "plugin-update-playwright",
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio,
      animations: "disabled",
      caret: "hide",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
