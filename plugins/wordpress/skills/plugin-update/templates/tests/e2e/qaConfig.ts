// Shared loader for the plugin-update Playwright suite.
// Reads the same plugin-update.config.json the skill scripts use, so routes,
// masks, the visual threshold, and the target URL live in ONE place.
//
// Target environment is selected by PLUGIN_UPDATE_ENV (default "staging"); the prod
// smoke check sets PLUGIN_UPDATE_ENV=production. This file is NOT a *.spec.ts, so
// Playwright does not run it as a test.

import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");
const cfg = JSON.parse(readFileSync(path.join(repoRoot, "plugin-update.config.json"), "utf8"));

export const env: string = process.env.PLUGIN_UPDATE_ENV || "staging";

const envBlock = cfg.environments?.[env];
if (!envBlock?.url) {
  throw new Error(`qaConfig: environment '${env}' has no url in plugin-update.config.json`);
}

export const baseURL: string = envBlock.url.replace(/\/$/, "");

// All configured environment hosts = "the site's own" origins. Used to scope
// asset/image/network checks to first-party resources so third-party noise
// (ads, embeds, analytics) never causes a false failure.
export const ownHosts: string[] = Object.values(cfg.environments || {})
  .map((e: any) => {
    try {
      return new URL(e.url).host;
    } catch {
      return null;
    }
  })
  .filter(Boolean);

export const routes: Array<{ name: string; path: string; pageType?: string }> = cfg.qa?.routes || [];

// Playwright storageState file with the minted admin session (gitignored).
// Written by scripts/mint-admin-session.mjs; consumed by admin.spec.ts.
export const adminStatePath: string = path.join(
  repoRoot,
  cfg.snapshotDir || ".plugin-update-snapshots",
  `${env}.admin-state.json`,
);
export const masks: string[] = cfg.qa?.visualDiff?.masks || [];
export const maxDiffPixelRatio: number = cfg.qa?.visualDiff?.maxDiffPixelRatio ?? 0.02;

// Site-specific interactive flows this project declares it HAS (path-valued).
// A flow is only checked if present here — keeps the skill portable. Setup
// auto-detects these (by active plugin + content shortcode) and writes them.
export const flows: Record<string, string> = cfg.qa?.flows || {};

// Per-project, theme-specific CSS selectors (nav, footer, share, filters,
// load-more, newsletter, search, hamburger…). The interactive/functional specs
// read EVERY theme selector from here and SKIP a check when its key is absent —
// nothing is hardcoded, so the suite is portable. Setup discovers + writes them
// (discover-selectors.mjs + human confirm). See config.schema.json › qa.selectors.
export const selectors: Record<string, string> = cfg.qa?.selectors || {};

// Per-project route paths + query terms the interactive/functional probes use
// (search query, events-filter archive/keyword, load-more archive). A probe-bound
// check skips when its key is absent. See config.schema.json › qa.probes.
export const probes: Record<string, string> = cfg.qa?.probes || {};
