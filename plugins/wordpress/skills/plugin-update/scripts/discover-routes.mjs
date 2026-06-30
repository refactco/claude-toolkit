#!/usr/bin/env node
// Setup-mode route discovery from the site's XML sitemap.
//
//   node agent/skills/plugin-update/scripts/discover-routes.mjs [--env staging] [--json]
//
// The sitemap is the authoritative, live list of what the site renders: each
// sub-sitemap is a page TYPE (= a template). We take one representative URL per
// type, add the always-needed home/search/404, verify each resolves on the
// target env, and print a proposed qa.routes block for the human to CONFIRM
// (this script never writes config — Setup writes it after sign-off).
//
// Robust to the common Kinsta-clone case where the target env's own sitemap
// 404s but robots.txt declares the canonical (prod) sitemap: structure + paths
// are read from whichever sitemap resolves, then every path is TESTED against
// the target env so a path that doesn't exist there is flagged, not trusted.

import { loadConfig, getEnv } from "./lib/config.mjs";

const UA = { "User-Agent": "plugin-update-discover" };

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const has = (f) => process.argv.includes(f);

// Friendly names for the standard WordPress/Yoast sub-sitemap bases. Anything
// not listed (a custom post type or taxonomy) falls back to its raw sub-sitemap
// slug as the route name — portable across themes, no per-project hardcoding.
// The human confirms/renames the proposed list at Setup either way.
const TYPE_NAMES = {
  post: { name: "single-article", pageType: "single post" },
  page: { name: "page", pageType: "static page" },
  category: { name: "category-archive", pageType: "category archive" },
  post_tag: { name: "tag-archive", pageType: "tag archive" },
  author: { name: "author", pageType: "author archive" },
};

async function fetchText(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow" });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

async function findSitemap(baseURL) {
  const robots = await fetchText(baseURL + "/robots.txt");
  const declared = robots && robots.match(/^\s*Sitemap:\s*(\S+)/im)?.[1];
  const candidates = [declared, `${baseURL}/sitemap_index.xml`, `${baseURL}/wp-sitemap.xml`, `${baseURL}/sitemap.xml`].filter(Boolean);
  for (const c of candidates) {
    const xml = await fetchText(c);
    if (xml && /<sitemapindex|<urlset/i.test(xml)) return { url: c, xml, declared };
  }
  return null;
}

function typeOf(sitemapUrl) {
  const file = (sitemapUrl.split("/").pop() || "").toLowerCase();
  const m = file.match(/^([a-z0-9_-]+?)-sitemap\d*\.xml$/);
  return m ? m[1] : file.replace(/\.xml$/, "");
}

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    return null;
  }
}

async function status(baseURL, path) {
  try {
    const r = await fetch(baseURL + path, { headers: UA, redirect: "follow" });
    return r.status;
  } catch {
    return 0;
  }
}

async function main() {
  const envName = arg("--env", "staging");
  const baseURL = getEnv(loadConfig(), envName).url.replace(/\/$/, "");

  const sm = await findSitemap(baseURL);
  if (!sm) {
    process.stderr.write(`discover-routes: no sitemap found for ${baseURL} (tried robots.txt + common paths).\n`);
    process.exit(1);
  }
  if (sm.declared && !sm.declared.startsWith(baseURL)) {
    process.stderr.write(`discover-routes: note — sitemap is served from ${new URL(sm.declared).origin} (not ${baseURL}); reading structure there and testing paths against ${envName}.\n`);
  }

  const subSitemaps = /<sitemapindex/i.test(sm.xml) ? locs(sm.xml) : [sm.url];
  const byType = new Map();
  for (const s of subSitemaps) {
    const t = typeOf(s);
    if (!byType.has(t)) byType.set(t, s); // first sub-sitemap of each type
  }

  const candidates = [{ name: "home", path: "/", pageType: "front page", source: "fixed", expect: 200 }];
  for (const [t, smUrl] of byType) {
    const meta = TYPE_NAMES[t] || { name: t, pageType: t };
    const xml = smUrl === sm.url ? sm.xml : await fetchText(smUrl);
    if (!xml) continue;
    const first = locs(xml).find((u) => u !== smUrl);
    const path = first && pathOf(first);
    if (path) candidates.push({ ...meta, path, source: `${t}-sitemap`, expect: 200 });
  }
  candidates.push({ name: "search", path: "/?s=the", pageType: "search results", source: "fixed", expect: 200 });
  candidates.push({ name: "not-found", path: "/plugin-update-404-probe/", pageType: "404", source: "fixed", expect: 404 });

  for (const c of candidates) {
    c.status = await status(baseURL, c.path);
    c.ok = c.expect === 404 ? c.status === 404 : c.status >= 200 && c.status < 400;
  }

  const okRoutes = candidates.filter((c) => c.ok).map(({ name, path, pageType }) => ({ name, path, pageType }));

  if (has("--json")) {
    process.stdout.write(JSON.stringify({ env: envName, baseURL, routes: okRoutes }, null, 2) + "\n");
    return;
  }
  process.stdout.write(`Proposed qa.routes from sitemap (env=${envName}, ${baseURL}):\n\n`);
  for (const c of candidates) {
    const mark = c.ok ? "OK " : "!! ";
    process.stdout.write(`  ${mark}[${String(c.status).padStart(3)}] ${c.name.padEnd(18)} ${c.path}   (${c.source})\n`);
  }
  process.stdout.write(`\n${okRoutes.length} reachable. Confirm/trim with the human, then save to qa.routes.\n`);
  process.stdout.write(`For visual baselines prefer an EVERGREEN single (sitemaps list newest-first — newest posts may get edited).\n`);
  const failed = candidates.filter((c) => !c.ok);
  if (failed.length) process.stdout.write(`\n${failed.length} path(s) didn't resolve on ${envName} — drop or replace before baselining.\n`);
}

main().catch((e) => {
  process.stderr.write(`discover-routes: ${e.message}\n`);
  process.exit(1);
});
