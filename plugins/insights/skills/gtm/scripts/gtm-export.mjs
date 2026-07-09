#!/usr/bin/env node
/**
 * gtm-export.mjs — read the LIVE (published) GTM container version and summarize
 * its tags, triggers, and variables. Read-only.
 *
 * This is the audit workhorse: "what's actually live", "is GA4 wired up and to
 * which measurement id", "which tags fire on what". It reads the published
 * version, not draft workspaces.
 *
 * Flags:
 *   --full        Print the entire raw live ContainerVersion JSON (everything).
 *                 Default prints a structured summary + name/type lists.
 *   --out=PATH    Write the full JSON (normal or --full output) to PATH instead
 *                 of stdout, printing only a one-line confirmation + a compact
 *                 summary (container, version, counts, Google ids).
 *
 * Usage:
 *   node gtm-export.mjs
 *   node gtm-export.mjs --full
 *   node gtm-export.mjs --full --out=gtm-live.json
 */

import fs from 'node:fs';
import { getAccessToken, resolveContainer, tmGet } from './_shared.mjs';

// Friendly labels for the GTM API's terse tag type codes (common ones).
const TAG_TYPE_LABELS = {
  googtag: 'Google tag',
  gaawc: 'GA4 Configuration',
  gaawe: 'GA4 Event',
  gclidw: 'Conversion Linker',
  awct: 'Google Ads Conversion',
  sp: 'Google Ads Remarketing',
  html: 'Custom HTML',
  img: 'Custom Image',
};

// Pull any Google id (G-, GT-, AW-, DC-, GTM-) out of a tag's parameters.
function googleIdsFromTag(tag) {
  const ids = new Set();
  const re = /\b(G-[A-Z0-9]+|GT-[A-Z0-9]+|AW-[A-Z0-9]+|DC-[A-Z0-9]+|GTM-[A-Z0-9]+)\b/g;
  const walk = (params) => {
    for (const p of params || []) {
      if (typeof p.value === 'string') {
        for (const m of p.value.matchAll(re)) ids.add(m[1]);
      }
      if (p.list) walk(p.list);
      if (p.map) walk(p.map);
    }
  };
  walk(tag.parameter);
  return [...ids];
}

function parseArgs(argv) {
  const args = { full: false, out: null };
  for (const a of argv.slice(2)) {
    if (a === '--full') { args.full = true; continue; }
    const m = a.match(/^--out=(.+)$/);
    if (m) args.out = m[1];
  }
  return args;
}

// Print the full JSON, or (with --out) write it to a file and print only a
// one-line confirmation + a compact summary.
function emit(output, outPath, summary) {
  const json = JSON.stringify(output, null, 2);
  if (!outPath) {
    console.log(json);
    return;
  }
  fs.writeFileSync(outPath, json, 'utf8');
  console.error(`Wrote live container export to ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const { full, out } = parseArgs(process.argv);
  const accessToken = await getAccessToken();
  const { accountId, containerId, publicId } = await resolveContainer(accessToken);

  const version = await tmGet(accessToken, `accounts/${accountId}/containers/${containerId}/versions:live`);

  if (full) {
    emit(version, out, {
      container: { publicId, accountId, containerId, name: version.container?.name },
      version: { id: version.containerVersionId, name: version.name || null },
      counts: {
        tags: (version.tag || []).length,
        triggers: (version.trigger || []).length,
        variables: (version.variable || []).length,
        builtInVariables: (version.builtInVariable || []).length,
      },
    });
    return;
  }

  const tags = (version.tag || []).map((t) => ({
    name: t.name,
    type: t.type,
    typeLabel: TAG_TYPE_LABELS[t.type] || t.type,
    paused: Boolean(t.paused),
    firingTriggerId: t.firingTriggerId || [],
    googleIds: googleIdsFromTag(t),
  }));
  const triggers = (version.trigger || []).map((t) => ({ triggerId: t.triggerId, name: t.name, type: t.type }));
  const variables = (version.variable || []).map((v) => ({ name: v.name, type: v.type }));
  const builtIn = (version.builtInVariable || []).map((v) => v.type);

  const allGoogleIds = [...new Set(tags.flatMap((t) => t.googleIds))];
  const ga4Tags = tags.filter((t) => ['googtag', 'gaawc', 'gaawe'].includes(t.type));

  const output = {
    container: { publicId, accountId, containerId, name: version.container?.name },
    version: { id: version.containerVersionId, name: version.name || null },
    counts: {
      tags: tags.length, triggers: triggers.length,
      variables: variables.length, builtInVariables: builtIn.length,
    },
    googleIds: allGoogleIds,
    ga4: {
      tagCount: ga4Tags.length,
      tags: ga4Tags.map((t) => ({ name: t.name, typeLabel: t.typeLabel, paused: t.paused, googleIds: t.googleIds })),
    },
    tags,
    triggers,
    variables,
    builtInVariables: builtIn,
  };

  emit(output, out, {
    container: output.container,
    version: output.version,
    counts: output.counts,
    googleIds: output.googleIds,
    ga4TagCount: output.ga4.tagCount,
  });
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
