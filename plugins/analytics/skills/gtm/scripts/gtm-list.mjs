#!/usr/bin/env node
/**
 * gtm-list.mjs — list every GTM account + container the connected account can see.
 *
 * Read-only. Use this to find the numeric accountId/containerId behind a public
 * GTM-XXXX id, or to confirm the configured gtm.publicId is accessible. If
 * .refact-os.json has a gtm.publicId, the matching container is flagged.
 *
 * Usage:
 *   node gtm-list.mjs
 */

import { getAccessToken, listContainers, readGtmConfig } from './_shared.mjs';

async function main() {
  const accessToken = await getAccessToken();
  const cfg = readGtmConfig();
  const want = cfg.publicId ? String(cfg.publicId).toUpperCase() : null;

  const containers = (await listContainers(accessToken)).map((c) => ({
    ...c,
    configured: want != null && (c.publicId || '').toUpperCase() === want,
  }));

  console.log(JSON.stringify({
    configuredPublicId: cfg.publicId ?? null,
    configuredIsAccessible: want != null && containers.some((c) => c.configured),
    containerCount: containers.length,
    containers,
  }, null, 2));
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
