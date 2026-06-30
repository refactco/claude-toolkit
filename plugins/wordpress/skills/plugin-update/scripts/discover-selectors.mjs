#!/usr/bin/env node
// Setup-mode selector discovery — proposes the project's qa.selectors block.
//
//   node agent/skills/plugin-update/scripts/discover-selectors.mjs [--env staging] [--json]
//
// The interactive/functional Playwright specs read EVERY theme-specific selector
// from qa.selectors (detect-and-skip when a key is absent) — nothing is hardcoded.
// This helper fetches the homepage + a single-post route and suggests a candidate
// selector per category, so Setup starts from a real-DOM base instead of a blank
// page. It is BEST-EFFORT and read-only: it never writes config. The agent then
// refines the proposals by live DOM inspection (Playwright/devtools) and the human
// confirms before they are saved to qa.selectors / qa.probes.
//
// Detection is intentionally conservative: WordPress-core + popular-plugin markers
// (block nav, block buttons, core lightbox, Ajax Load More) are detected by their
// stable class names; brand/theme-specific regions (custom share blocks, bespoke
// nav wrappers, event filters) can't be guessed and are reported as "discover
// manually" so they are filled by inspection, never by a wrong guess.

import { loadConfig, getEnv } from "./lib/config.mjs";

const UA = { "User-Agent": "plugin-update-discover" };

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const has = (f) => process.argv.includes(f);

async function fetchText(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow" });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// Each category lists ordered candidates. A candidate with `probe` is proposed
// only if that token appears in the fetched HTML (detected); a candidate without
// `probe` is a structural fallback (e.g. the <footer> landmark) proposed at lower
// confidence. If nothing matches, the key is left for manual discovery.
const CATEGORIES = [
  { key: "navWrapper", note: "primary nav container (link-integrity + dropdown scope)", candidates: [
    { sel: ".wp-block-navigation", probe: "wp-block-navigation" },
    { sel: "header nav" }, // structural fallback
  ] },
  { key: "footer", note: "site footer (link integrity)", candidates: [
    { sel: "footer" }, // structural — the <footer> landmark
  ] },
  { key: "navDropdownToggle", note: "sub-menu open control", candidates: [
    { sel: ".wp-block-navigation__submenu-icon", probe: "wp-block-navigation__submenu-icon" },
  ] },
  { key: "navSubmenuContainer", note: "opened sub-menu panel", candidates: [
    { sel: ".wp-block-navigation__submenu-container", probe: "wp-block-navigation__submenu-container" },
  ] },
  { key: "ctaButton", note: "in-page anchor CTA buttons", candidates: [
    { sel: "a.wp-block-button__link[href^='#']", probe: "wp-block-button__link" },
  ] },
  { key: "tableOfContents", note: "article table-of-contents", candidates: [
    { sel: "#toc_container, .toc_container, nav.table-of-contents", probe: "toc_container" },
    { sel: "nav.table-of-contents", probe: "table-of-contents" },
  ] },
  { key: "lightboxTrigger", note: "image lightbox opener", candidates: [
    { sel: "button.lightbox-trigger, .wp-lightbox-container button", probe: "wp-lightbox-container" },
  ] },
  { key: "lightboxOverlay", note: "opened lightbox overlay", candidates: [
    { sel: ".wp-lightbox-overlay.active, .wp-lightbox-overlay.zoom.active", probe: "wp-lightbox-overlay" },
  ] },
  { key: "loadMoreWrap", note: "Ajax Load More wrapper", candidates: [
    { sel: ".ajax-load-more-wrap", probe: "ajax-load-more-wrap" },
  ] },
  { key: "loadMoreItems", note: "Ajax Load More items container", candidates: [
    { sel: ".alm-listing > *", probe: "alm-listing" },
  ] },
  { key: "loadMoreButton", note: "Ajax Load More button", candidates: [
    { sel: ".alm-load-more-btn", probe: "alm-load-more-btn" },
  ] },
  { key: "hamburgerButton", note: "mobile menu toggle", candidates: [
    { sel: ".wp-block-navigation__responsive-container-open", probe: "wp-block-navigation__responsive-container-open" },
    { sel: "button[aria-controls][aria-expanded]" }, // structural fallback
  ] },
  { key: "mobileNavLinks", note: "links revealed after opening the mobile menu", candidates: [
    { sel: ".wp-block-navigation__responsive-container.is-menu-open a", probe: "wp-block-navigation__responsive-container" },
  ] },
  { key: "newsletterSignup", note: "embedded newsletter form (3rd-party)", candidates: [
    { sel: "form.hs-form, .hbspt-form", probe: "hs-form" },
    { sel: "#mc_embed_signup", probe: "mc_embed_signup" },
  ] },
  { key: "newsletterEmailField", note: "newsletter email input", candidates: [
    { sel: "input[type='email'], input[name='email']" }, // structural fallback
  ] },
  // No reliable cross-theme marker — always manual:
  { key: "shareBlock", note: "social-share block (theme-specific) — discover manually", candidates: [] },
  { key: "shareControls", note: "share links/buttons inside the share block — discover manually", candidates: [] },
  { key: "eventsFilterInput", note: "keyword filter input on a filtered archive — discover manually", candidates: [] },
  { key: "eventsListingContainer", note: "the filtered listing container — discover manually", candidates: [] },
  { key: "searchResults", note: "search-results container — discover manually", candidates: [] },
  { key: "searchEmptyState", note: "search no-results element — discover manually", candidates: [] },
];

function pick(category, html) {
  for (const c of category.candidates) {
    if (!c.probe) return { sel: c.sel, confidence: "structural" };
    if (html.includes(c.probe)) return { sel: c.sel, confidence: "detected" };
  }
  return null;
}

async function main() {
  const cfg = loadConfig();
  const envName = arg("--env", "staging");
  const baseURL = getEnv(cfg, envName).url.replace(/\/$/, "");

  const routes = cfg.qa?.routes || [];
  const single = routes.find((r) => /single/i.test(`${r.name} ${r.pageType ?? ""}`));
  const pages = ["/", single?.path].filter(Boolean);

  let html = "";
  for (const p of pages) {
    const t = await fetchText(baseURL + p);
    if (t) html += "\n" + t;
  }
  if (!html) {
    process.stderr.write(`discover-selectors: could not fetch ${baseURL} (homepage${single ? " + " + single.path : ""}).\n`);
    process.exit(1);
  }

  const selectors = {};
  const rows = [];
  for (const cat of CATEGORIES) {
    const hit = pick(cat, html);
    if (hit) selectors[cat.key] = hit.sel;
    rows.push({ key: cat.key, note: cat.note, sel: hit?.sel ?? null, confidence: hit?.confidence ?? "manual" });
  }

  if (has("--json")) {
    process.stdout.write(JSON.stringify({ env: envName, baseURL, selectors, rows }, null, 2) + "\n");
    return;
  }

  process.stdout.write(`Proposed qa.selectors from live DOM (env=${envName}, ${baseURL}):\n\n`);
  for (const r of rows) {
    const mark = r.confidence === "detected" ? "OK  " : r.confidence === "structural" ? "~?  " : "MANUAL";
    process.stdout.write(`  ${mark.padEnd(7)} ${r.key.padEnd(24)} ${r.sel ?? "(discover by inspection)"}\n`);
  }
  process.stdout.write(`\nLegend: OK = detected marker · ~? = structural fallback (verify) · MANUAL = inspect the DOM.\n`);
  process.stdout.write(`These are CANDIDATES. Confirm each against the real DOM, fill the MANUAL ones,\nthen save the agreed set under qa.selectors. Routes/queries for the events filter,\nload-more archive, and search go under qa.probes.\n`);
  process.stdout.write(`\nProposed block:\n${JSON.stringify({ selectors }, null, 2)}\n`);
}

main().catch((e) => {
  process.stderr.write(`discover-selectors: ${e.message}\n`);
  process.exit(1);
});
