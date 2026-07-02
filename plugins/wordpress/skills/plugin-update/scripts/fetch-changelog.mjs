#!/usr/bin/env node
// Fetch a plugin's changelog, sliced to the versions being applied.
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/fetch-changelog.mjs --slug <slug> [--from <ver>] [--to <ver>] [--env staging]
//
// Primary source: the WordPress.org plugins API (public, no auth). For premium
// / off-directory plugins (API returns "not found"), falls back to reading the
// plugin's readme.txt on the server over SSH. Prints the (sliced) changelog to
// stdout for the agent to read when drafting the targeted QA checklist.

import { spawnSync } from "node:child_process";
import { loadConfig, getEnv, shellQuote } from "./lib/config.mjs";

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

/** Loose dotted-version compare: 1.10.2 > 1.10.1.1 > 1.9. */
function cmpVer(a, b) {
  const pa = String(a).split(/[^\d]+/).filter(Boolean).map(Number);
  const pb = String(b).split(/[^\d]+/).filter(Boolean).map(Number);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function htmlToText(html) {
  return html
    .replace(/<\s*\/(li|p|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "  - ")
    .replace(/<\s*h[1-6][^>]*>/gi, "\n### ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split changelog text into [{version, body}] blocks. Handles both the WP.org
 * rendered "### 1.10.2" headings (from htmlToText) and readme.txt "= 1.10.2 ="
 * headings.
 */
function splitVersions(text) {
  const lines = text.split("\n");
  const blocks = [];
  let current = null;
  // Match version headings in all common forms — "### 1.10.2", "= 1.10.2 =",
  // "= 1.10.2 (2024-01-15) =", "### 1.10.2 (2024-01-15)", "Version 1.2.3".
  // Requires >=2 dotted segments so a bare year ("2024") never matches, and the
  // version must be the line's leading token so list items ("  - 1.2.3 …") don't.
  const headerRe = /^\s*(?:###\s*|=\s*)?v?(?:ersion\s*)?(\d+(?:\.\d+)+)\b/i;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      current = { version: m[1], body: [] };
      blocks.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return blocks.map((b) => ({ version: b.version, body: b.body.join("\n").trim() }));
}

function sliceToRange(text, from, to) {
  const blocks = splitVersions(text);
  if (blocks.length === 0) return null;
  const inRange = blocks.filter((b) => {
    const aboveFrom = from ? cmpVer(b.version, from) > 0 : true;
    const atOrBelowTo = to ? cmpVer(b.version, to) <= 0 : true;
    return aboveFrom && atOrBelowTo;
  });
  if (inRange.length === 0) return null;
  return inRange.map((b) => `### ${b.version}\n${b.body}`).join("\n\n");
}

async function fromWpOrg(slug) {
  const url =
    `https://api.wordpress.org/plugins/info/1.2/?action=plugin_information` +
    `&request[slug]=${encodeURIComponent(slug)}&request[fields][sections]=true`;
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": "plugin-update/1.0" } });
  } catch (e) {
    return { ok: false, reason: `network error: ${e.message}` };
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  const data = await res.json();
  if (data?.error) return { ok: false, reason: data.error };
  const changelogHtml = data?.sections?.changelog;
  if (!changelogHtml) return { ok: false, reason: "no changelog section in API response" };
  return { ok: true, text: htmlToText(changelogHtml), source: "wordpress.org API" };
}

function fromReadme(slug, env) {
  const docRoot = env.ssh.path;
  const { user, host, port } = env.ssh;
  // Try readme.txt then changelog.txt in the plugin dir.
  const remote =
    `cd ${shellQuote(docRoot + "/wp-content/plugins/" + slug)} && ` +
    `(cat readme.txt 2>/dev/null || cat changelog.txt 2>/dev/null || echo "__NO_README__")`;
  const res = spawnSync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20",
      "-p", String(port), `${user}@${host}`, remote],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (res.status !== 0 || !res.stdout || res.stdout.includes("__NO_README__")) {
    return { ok: false, reason: `no readme/changelog on server for ${slug}` };
  }
  // Extract the == Changelog == section if present.
  const txt = res.stdout;
  const idx = txt.search(/==\s*Changelog\s*==/i);
  const section = idx >= 0 ? txt.slice(idx).replace(/==\s*Changelog\s*==/i, "") : txt;
  return { ok: true, text: section.trim(), source: "server readme.txt" };
}

async function main() {
  const slug = arg("--slug");
  if (!slug) {
    process.stderr.write("fetch-changelog: --slug is required.\n");
    process.exit(1);
  }
  const from = arg("--from");
  const to = arg("--to");
  const envName = arg("--env", "staging");

  let result = await fromWpOrg(slug);
  if (!result.ok) {
    let env;
    try {
      env = getEnv(loadConfig(), envName);
    } catch (e) {
      process.stderr.write(`fetch-changelog: WP.org lookup failed (${result.reason}) and no config for SSH fallback: ${e.message}\n`);
      process.exit(1);
    }
    process.stderr.write(`fetch-changelog: WP.org lookup failed (${result.reason}); falling back to server readme.\n`);
    result = fromReadme(slug, env);
  }
  if (!result.ok) {
    process.stderr.write(`fetch-changelog: could not retrieve a changelog for '${slug}' (${result.reason}).\n`);
    process.exit(1);
  }

  const sliced = from || to ? sliceToRange(result.text, from, to) : null;
  const range = `${from || "?"} -> ${to || "latest"}`;
  process.stdout.write(`# Changelog for ${slug} (${range}) — source: ${result.source}\n\n`);
  if (sliced) {
    process.stdout.write(sliced + "\n");
  } else {
    if (from || to) {
      process.stdout.write(`(could not isolate the ${range} range — showing full changelog)\n\n`);
    }
    process.stdout.write(result.text + "\n");
  }
}

main().catch((e) => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
