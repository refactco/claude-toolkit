#!/usr/bin/env node
// Server-side, delta-vs-baseline QA: fingerprint every qa.route's HTML + headers
// BEFORE the update, then COMPARE AFTER. Catches SEO head-output regressions,
// vanished security/cache headers, missing/duplicated analytics tags, net-new or
// dropped assets, and status/redirect regressions — without a browser.
//
//   node agent/skills/plugin-update/scripts/fingerprint.mjs --env staging --capture   # baseline (run with snapshot)
//   node agent/skills/plugin-update/scripts/fingerprint.mjs --env staging --compare   # after the update
//
// Only DELTAS vs the same-build baseline are reported (this site's staging is
// SEO-stripped + caching-off + carries pre-existing debt identical to prod, so
// absolute checks are meaningless). HARD regressions (a present-before SEO field
// or JSON-LD type disappearing; a 2xx route turning 4xx/5xx) exit non-zero;
// everything else is a SOFT flag.

import fs from "node:fs";
import path from "node:path";
import { loadConfig, getEnv, snapshotDir, clearPassRecords } from "./lib/config.mjs";

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const has = (f) => process.argv.includes(f);

function pick(re, html) {
  const m = html.match(re);
  return m ? (m[1] || "").trim() : null;
}

function fingerprintHtml(html) {
  const head = (html.split(/<\/head>/i)[0] || html);
  const seo = {
    title: pick(/<title[^>]*>([^<]*)<\/title>/i, head),
    description: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, head),
    canonical: pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i, head),
    robots: pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i, head),
    ogTitle: pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i, head),
    ogImage: pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i, head),
    jsonLdTypes: [],
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const nodes = Array.isArray(data) ? data : data["@graph"] || [data];
      for (const n of nodes) {
        if (!n || !n["@type"]) continue;
        const t = n["@type"];
        (Array.isArray(t) ? t : [t]).forEach((x) => seo.jsonLdTypes.push(String(x))); // @type may be an array
      }
    } catch { /* ignore unparseable */ }
  }
  seo.jsonLdTypes = [...new Set(seo.jsonLdTypes)].sort();

  const tags = {
    gtm: (html.match(/GTM-[A-Z0-9]+/g) || []).length,
    ga4: (html.match(/G-[A-Z0-9]{6,}/g) || []).length,
    gtag: (html.match(/gtag\(/g) || []).length,
    ua: (html.match(/UA-\d{4,}-\d+/g) || []).length,
    ahrefs: (html.match(/analytics\.ahrefs\.com|ahrefs-analytics/g) || []).length,
    hubspot: (html.match(/js\.hs-scripts\.com|js\.hsforms\.net|hbspt/g) || []).length,
    fbq: (html.match(/connect\.facebook\.net|fbq\(/g) || []).length,
  };

  const norm = (u) => u.replace(/\?[^"']*$/, "").replace(/^https?:\/\/[^/]+/, "");
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => norm(m[1])))].sort();
  const styles = [...new Set([...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((m) => norm(m[1])))].sort();
  return { seo, tags, assets: { scripts, styles } };
}

const SEC_HEADERS = ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy"];
const CACHE_HEADERS = ["cache-control", "content-encoding", "cf-cache-status", "x-kinsta-cache"];

async function fetchRoute(baseURL, route) {
  const url = baseURL + (route.path.startsWith("/") ? route.path : "/" + route.path);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000); // never let a hung route stall the HARD compare
  try {
    const res = await fetch(url, { headers: { "User-Agent": "plugin-update-fingerprint" }, redirect: "follow", signal: ctrl.signal });
    const html = await res.text();
    const headers = {};
    for (const h of [...SEC_HEADERS, ...CACHE_HEADERS]) headers[h] = res.headers.has(h);
    return { name: route.name, status: res.status, finalUrl: res.url, headers, ...fingerprintHtml(html) };
  } catch (e) {
    return { name: route.name, status: 0, error: String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Build a fingerprint in memory — never writes. Callers decide whether to
// persist (only --capture does). This is the M1 fix: --compare must NOT touch
// the baseline file, or a crash mid-compare would leave the after-state as the
// baseline and silently disable the gate on the next run.
async function buildFingerprint(config, envName) {
  const baseURL = getEnv(config, envName).url.replace(/\/$/, "");
  const routes = config.qa?.routes || [];
  const fp = { env: envName, baseURL, takenAt: new Date().toISOString(), routes: {} };
  for (const r of routes) fp.routes[r.name] = await fetchRoute(baseURL, r);
  return fp;
}

function compareRoute(name, before, after) {
  const hard = [];
  const soft = [];
  if (!before || !after) return { hard, soft };
  // status / redirect regression (HARD)
  const was2xx = before.status >= 200 && before.status < 400;
  const now2xx = after.status >= 200 && after.status < 400;
  if (was2xx && !now2xx) hard.push(`${name}: status ${before.status} → ${after.status}`);
  if (before.error || after.error) return { hard, soft };
  // SEO structural loss (HARD): a present-before field empties/disappears
  for (const f of ["title", "description", "canonical", "ogTitle", "ogImage"]) {
    if (before.seo[f] && !after.seo[f]) hard.push(`${name}: SEO ${f} present-before but now MISSING`);
  }
  const lostTypes = (before.seo.jsonLdTypes || []).filter((t) => !(after.seo.jsonLdTypes || []).includes(t));
  if (lostTypes.length) hard.push(`${name}: JSON-LD type(s) lost: ${lostTypes.join(", ")}`);
  // robots index→noindex flip (SOFT — could be intentional)
  if (!/noindex/i.test(before.seo.robots || "") && /noindex/i.test(after.seo.robots || "")) soft.push(`${name}: robots flipped to noindex`);
  // headers vanished (SOFT)
  for (const h of [...SEC_HEADERS, ...CACHE_HEADERS]) {
    if (before.headers?.[h] && !after.headers?.[h]) soft.push(`${name}: header '${h}' vanished`);
  }
  // tags missing or duplicated (SOFT)
  for (const t of Object.keys(before.tags || {})) {
    const b = before.tags[t], a = after.tags?.[t] ?? 0;
    if (b > 0 && a === 0) soft.push(`${name}: tracking tag '${t}' MISSING (was ${b})`);
    if (a > b && b > 0) soft.push(`${name}: tracking tag '${t}' DUPLICATED (${b} → ${a})`);
  }
  // assets net-new / dropped (SOFT)
  for (const kind of ["scripts", "styles"]) {
    const bset = new Set(before.assets?.[kind] || []);
    const aset = new Set(after.assets?.[kind] || []);
    const added = [...aset].filter((x) => !bset.has(x));
    const removed = [...bset].filter((x) => !aset.has(x));
    if (added.length) soft.push(`${name}: net-new ${kind}: ${added.slice(0, 5).join(", ")}${added.length > 5 ? " …" : ""}`);
    if (removed.length) soft.push(`${name}: dropped ${kind}: ${removed.slice(0, 5).join(", ")}${removed.length > 5 ? " …" : ""}`);
  }
  return { hard, soft };
}

async function main() {
  const envName = arg("--env", "staging");
  const config = loadConfig();
  const baselinePath = path.join(snapshotDir(config), `${envName}.fingerprint.json`);

  if (has("--capture")) {
    const fp = await buildFingerprint(config, envName);
    fs.mkdirSync(snapshotDir(config), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(fp, null, 2) + "\n");
    process.stdout.write(`fingerprint: captured ${Object.keys(fp.routes).length} routes for ${envName} → ${config.snapshotDir}/${envName}.fingerprint.json\n`);
    return;
  }
  if (has("--compare")) {
    if (!fs.existsSync(baselinePath)) {
      process.stderr.write(`fingerprint: no baseline at ${baselinePath} — run --capture before the update.\n`);
      process.exit(1);
    }
    const before = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const after = await buildFingerprint(config, envName); // in memory — baseline is never touched
    const allHard = [], allSoft = [];
    for (const name of Object.keys(before.routes)) {
      const { hard, soft } = compareRoute(name, before.routes[name], after.routes[name]);
      allHard.push(...hard);
      allSoft.push(...soft);
    }
    const hardFail = allHard.length > 0;
    if (hardFail) {
      const cleared = clearPassRecords(config, envName);
      if (cleared.length) process.stderr.write(`fingerprint: HARD fail → revoked pass record(s): ${cleared.join(", ")}\n`);
    }
    process.stdout.write(JSON.stringify({ env: envName, hardFail, hard: allHard, soft: allSoft }, null, 2) + "\n");
    process.exit(hardFail ? 1 : 0);
  }
  process.stderr.write("fingerprint: pass --capture or --compare.\n");
  process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`fingerprint: ${e.message}\n`);
  process.exit(1);
});
