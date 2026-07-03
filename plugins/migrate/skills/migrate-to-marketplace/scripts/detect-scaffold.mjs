#!/usr/bin/env node
// detect-scaffold.mjs — READ-ONLY. Scans the current project (process.cwd()) for
// refact-os scaffold markers and prints a JSON migration report. It NEVER mutates
// anything; the migrate-to-marketplace skill drives the actual changes after the
// user approves this report.
//
//   node ${CLAUDE_PLUGIN_ROOT}/skills/migrate-to-marketplace/scripts/detect-scaffold.mjs
//   node .../detect-scaffold.mjs --summary   # human-readable text instead of JSON

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const p = (...s) => path.join(ROOT, ...s);
const exists = (...s) => existsSync(p(...s));
const readJSON = (rel) => {
  try { return JSON.parse(readFileSync(p(rel), "utf8")); } catch { return null; }
};
const listDir = (rel) => {
  try { return readdirSync(p(rel)).filter((n) => statSync(p(rel, n)).isDirectory()); }
  catch { return []; }
};

// --- Disposition of the 30-odd scaffold skills against the 7-pack marketplace. ---
const SKILL_TO_PACK = {
  asana: "base", "git-workflow": "base", "sync-env-vars": "base",
  "extract-learnings": "base", "update-project-config": "base",
  "writing-client-updates": "base", "code-development": "base",
  "draft-discovery-proposal": "client", "render-deliverable": "client",
  cloudflare: "ops", sentry: "ops",
  "wp-env": "wordpress", "install-wp-skills": "wordpress", "plugin-update": "wordpress",
  "setup-kinsta-deploy": "wordpress", "setup-wpengine-deploy": "wordpress",
  tdd: "testing", "tdd-plan": "testing", "red-green-refactor": "testing",
  "backfill-tests": "testing", "integration-tests": "testing",
  "setup-nextjs-app": "nextjs", "nextjs-dev": "nextjs",
  "setup-vercel-deploy": "nextjs", "setup-netlify-deploy": "nextjs",
  ahrefs: "insights", ga4: "insights", gsc: "insights", gtm: "insights", pagespeed: "insights",
};
const BECOMES_COMMAND = { refact: "/refact command (base)" };
const OBSOLETE = new Set([
  "adopt", "git-it", "setup-project", "create-skill", "list-skills",
  "get-skill", "contribute-skill", "update-package", "add-codebase",
  "release", "write-update-note", "create-deliverable",
]);
const NO_REPLACEMENT = new Set([
  "ingest-input", "process-docs", "open-ticket", "close-ticket",
  "update-canonical-record", "project-status", "import-chat-history",
]);

// --- Scaffold markers ---------------------------------------------------------
const cfg = readJSON(".refact-os.json");
const pkg = readJSON("package.json");
const refactScripts = pkg?.scripts
  ? Object.keys(pkg.scripts).filter((s) => /^(refact:|asana:|sentry:|chats:)/.test(s))
  : [];
const hasRefactDep = !!(pkg?.devDependencies?.["@refactco/refact-os"] ||
  pkg?.dependencies?.["@refactco/refact-os"]);
const markers = {
  "agent/skills/": exists("agent", "skills"),
  ".claude/GENERATED.md": exists(".claude", "GENERATED.md"),
  ".cursor/GENERATED.md": exists(".cursor", "GENERATED.md"),
  "@refactco/refact-os in package.json": hasRefactDep,
  "refact:*/asana:*/sentry:*/chats:* npm scripts": refactScripts.length > 0,
  "_scaffold or _about in .refact-os.json": !!(cfg && (cfg._scaffold || cfg._about)),
};
const isScaffold = Object.values(markers).some(Boolean);

// --- Classify the local agent/skills -----------------------------------------
const localSkills = listDir("agent/skills").filter((n) => !n.startsWith("."));
const movesToPack = [], becomesCommand = [], obsolete = [], noReplacement = [], unknown = [];
for (const s of localSkills) {
  if (SKILL_TO_PACK[s]) movesToPack.push({ skill: s, pack: SKILL_TO_PACK[s] });
  else if (BECOMES_COMMAND[s]) becomesCommand.push({ skill: s, target: BECOMES_COMMAND[s] });
  else if (OBSOLETE.has(s)) obsolete.push(s);
  else if (NO_REPLACEMENT.has(s)) noReplacement.push(s);
  else unknown.push(s);
}

// --- Which packs does THIS project need? -------------------------------------
const stack = cfg?.stack || {};
const apps = Array.isArray(cfg?.apps) ? cfg.apps : [];
const hostings = apps.map((a) => (a.hosting || "").toLowerCase());
const runtimes = apps.map((a) => (a.runtime || "").toLowerCase()).join(" ");
const has = (set, name) => set.some((x) => x.pack === name);
const isWordPress = !!stack.wordpress || exists(".wp-env.json") ||
  hostings.some((h) => ["wpengine", "kinsta"].includes(h)) || /wp-env/.test(runtimes) ||
  has(movesToPack, "wordpress");
const isNext = !!stack.nextjs || exists("next.config.js") || exists("next.config.mjs") ||
  has(movesToPack, "nextjs");
const hasSentry = !!cfg?.sentry || localSkills.includes("sentry") || localSkills.includes("cloudflare");
const hasClient = localSkills.includes("draft-discovery-proposal") || localSkills.includes("render-deliverable");
const hasInsights = ["ahrefs", "ga4", "gsc", "gtm", "pagespeed"].some((s) => localSkills.includes(s));

const rec = (name, cond, reasonYes, reasonNo, optional = false) =>
  ({ pack: name, recommend: cond ? "install" : (optional ? "optional" : "skip"),
     reason: cond ? reasonYes : reasonNo });
const packs = [
  { pack: "base", recommend: "install", reason: "always — git-workflow, code gates, asana, env sync, /refact, TS/JS LSP, transcript hook" },
  rec("wordpress", isWordPress, "WordPress signals (stack.wordpress / wp-env / wpengine|kinsta)", "no WordPress signal"),
  rec("nextjs", isNext, "Next.js signals (stack.nextjs / next.config)", "no Next.js signal"),
  rec("ops", hasSentry, "sentry config present (or cloudflare/sentry skill used)", "no ops signal", true),
  rec("client", hasClient, "had draft-discovery-proposal / render-deliverable", "no client-deliverable skill", true),
  rec("testing", isWordPress || has(movesToPack, "testing"), "had the TDD/backfill/integration skills or is WordPress", "no testing signal", true),
  rec("insights", hasInsights, "had ahrefs/ga4/gsc/gtm/pagespeed skills", "insights skills were not present — install only if you want the SEO/analytics toolset", true),
];

// --- Config slim plan ---------------------------------------------------------
const CFG_DROP = ["_about", "_scaffold"];
const cfgKeys = cfg ? Object.keys(cfg) : [];
const config = {
  path: ".refact-os.json",
  present: !!cfg,
  keysToDrop: cfgKeys.filter((k) => CFG_DROP.includes(k)),
  keysToKeep: cfgKeys.filter((k) => !CFG_DROP.includes(k)),
  skillReadBlocksPresent: ["asana", "sentry", "wpEnv", "stack"].filter((k) => cfg && k in cfg),
  note: "Delete ONLY _about + _scaffold, in place. Keep the rest — asana/sentry/wpEnv/stack are read by the packs.",
};

// --- Trees to remove vs preserve ---------------------------------------------
const removeTrees = [
  { rel: "agent", label: "agent/" },
  { rel: ".claude/GENERATED.md", label: ".claude/GENERATED.md" },
  { rel: ".claude/skills", label: ".claude/skills/" },
  { rel: ".claude/scripts", label: ".claude/scripts/" },
  { rel: ".cursor", label: ".cursor/ (entire — unless the team still uses Cursor)" },
].filter((c) => existsSync(p(...c.rel.split("/")))).map((c) => c.label);
const preserve = ["docs/", "apps/", ".env", ".github/", "tools/", ".wp-env.json", ".wp-env.override.json",
  ".claude/settings.json (team permissions)", ".claude/settings.local.json", ".claude/logs/"]
  .filter((t) => existsSync(p(t.split(" ")[0])));

// --- Hooks + MCP context ------------------------------------------------------
const settings = readJSON(".claude/settings.json");
const hooks = {
  transcriptHooksInSettings: !!settings?.hooks && JSON.stringify(settings.hooks).includes("transcript"),
  note: "The base pack owns transcript send-to-remote. Strip the hooks block from .claude/settings.json (keep permissions) and delete .claude/hooks; nothing is saved into the repo.",
};
const mcp = {
  cursorMcpJson: exists(".cursor", "mcp.json"),
  rootMcpJson: exists(".mcp.json"),
  note: "A .cursor/mcp.json server is Cursor-only — Claude Code never reads it. Check ~/.claude.json + .claude/settings.local.json for the real MCP wiring (often a claude.ai remote integration). Do NOT auto-create a repo .mcp.json; ask first.",
};

// --- Broken docs/ links after agent/ is removed -------------------------------
// Scan only docs/*.md, skipping docs/sources/raw (evidence — transcripts/emails,
// often huge .jsonl that merely mention "agent/"). These are flagged for the user
// to repoint at CLAUDE.md / installed packs — historical tickets are reported too,
// but repointing them is a human call (do not rewrite recorded history blindly).
function walkMd(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (full.includes(path.join("docs", "sources", "raw"))) continue;
      walkMd(full, acc);
    } else if (e.name.endsWith(".md")) acc.push(full);
  }
  return acc;
}
const docsLinksToRepair = [];
if (exists("docs")) {
  for (const f of walkMd(p("docs"))) {
    let lines;
    try { lines = readFileSync(f, "utf8").split("\n"); } catch { continue; }
    lines.forEach((ln, i) => {
      if (/agent\/(AGENTS\.md|CLAUDE\.md|skills\/)|\]\([^)]*agent\//.test(ln)) {
        docsLinksToRepair.push({ file: path.relative(ROOT, f), line: i + 1, text: ln.trim().slice(0, 120) });
      }
    });
  }
}

const report = {
  root: ROOT, isScaffold, markers,
  docsLinksToRepair,
  packsToInstall: packs,
  skills: { total: localSkills.length, movesToPack, becomesCommand, obsolete, noReplacement, unknown },
  config,
  packageJson: { hasRefactDep, refactScriptsToRemove: refactScripts,
    keepScripts: pkg?.scripts ? Object.keys(pkg.scripts).filter((s) => !refactScripts.includes(s)) : [] },
  removeTrees, preserve, hooks, mcp,
};

if (process.argv.includes("--summary")) {
  const L = (s = "") => process.stdout.write(s + "\n");
  L(`Scaffold detected: ${isScaffold ? "YES" : "no"}`);
  L(`Markers: ${Object.entries(markers).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`);
  L(`\nPacks to install:`);
  for (const x of packs) L(`  [${x.recommend.padEnd(8)}] ${x.pack} — ${x.reason}`);
  L(`\nSkills (${localSkills.length}): moves=${movesToPack.length} command=${becomesCommand.length} obsolete=${obsolete.length} no-replacement=${noReplacement.length} unknown=${unknown.length}`);
  if (noReplacement.length) L(`  NO PACK REPLACEMENT (decide per item): ${noReplacement.join(", ")}`);
  if (unknown.length) L(`  UNKNOWN (review by hand): ${unknown.join(", ")}`);
  L(`\nConfig: drop ${config.keysToDrop.join("+") || "(none)"}; keep ${config.keysToKeep.length} keys (${config.skillReadBlocksPresent.join(",")} are read by packs)`);
  L(`package.json: remove ${report.packageJson.refactScriptsToRemove.length} scripts + refact-os dep=${hasRefactDep}`);
  L(`Remove: ${removeTrees.join(", ")}`);
  L(`Preserve: ${preserve.map((s) => s.split(" ")[0]).join(", ")}`);
  const docFiles = [...new Set(docsLinksToRepair.map((d) => d.file))];
  L(`docs/ links to repoint off agent/: ${docsLinksToRepair.length}${docFiles.length ? " in " + docFiles.join(", ") : ""}`);
} else {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
