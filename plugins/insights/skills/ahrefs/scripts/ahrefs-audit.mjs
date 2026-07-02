#!/usr/bin/env node
/**
 * ahrefs-audit.mjs — pull Site Audit issues for the configured project (headless
 * fallback for the analyze step). Read-only.
 *
 * Mirrors the Ahrefs MCP `site-audit-issues` tool but via the API v3, for runs
 * where the MCP isn't available. By default returns only issues actually present
 * on the site (crawled > 0), sorted Error → Warning → Notice.
 *
 * Flags:
 *   --all                Include issue types with 0 affected URLs (the full catalog).
 *   --severity=LEVEL     Filter: Error | Warning | Notice.
 *   --project-id=N       Override the project id from .refact-os.json.
 *   --out=PATH           Write JSON to PATH instead of stdout.
 *
 * Usage:
 *   node ahrefs-audit.mjs
 *   node ahrefs-audit.mjs --severity=Warning
 */

import fs from 'node:fs';
import { ahrefsGet, readProjectId } from './_shared.mjs';

function parseFlags(argv) {
  const flags = { all: false };
  for (const a of argv) {
    if (a === '--all') { flags.all = true; continue; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const projectId = flags['project-id'] || readProjectId();
  const data = await ahrefsGet('site-audit/issues', { project_id: projectId });
  const order = { Error: 0, Warning: 1, Notice: 2 };

  let issues = (data.issues || []);
  if (!flags.all) issues = issues.filter((i) => i.crawled > 0);
  if (flags.severity) issues = issues.filter((i) => (i.importance || '').toLowerCase() === flags.severity.toLowerCase());
  issues.sort((a, b) => (order[a.importance] - order[b.importance]) || (b.crawled - a.crawled));

  const summary = { Error: 0, Warning: 0, Notice: 0 };
  for (const i of issues) summary[i.importance] = (summary[i.importance] || 0) + 1;

  const out = {
    projectId: Number(projectId),
    issueCount: issues.length,
    bySeverity: summary,
    issues: issues.map((i) => ({
      name: i.name, importance: i.importance, category: i.category,
      crawled: i.crawled, new: i.new, change: i.change, issue_id: i.issue_id,
    })),
  };
  const content = JSON.stringify(out, null, 2);
  if (flags.out) { fs.writeFileSync(flags.out, content, 'utf8'); console.error(`Wrote ${out.issueCount} issue(s) to ${flags.out}`); }
  else console.log(content);
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
