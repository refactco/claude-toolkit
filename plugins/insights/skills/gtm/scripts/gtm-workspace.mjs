#!/usr/bin/env node
/**
 * gtm-workspace.mjs — manage GTM workspaces (the drafts edits live in).
 *
 * Edits never touch the live container directly — they go into a workspace, and a
 * human publishes that workspace in the GTM UI (authority: edit only, human
 * publishes). This script lists workspaces, creates one, and shows a workspace's
 * pending changes so you can report exactly what's staged for review.
 *
 * Commands:
 *   list                         List workspaces in the container.
 *   create --name=NAME           Create a workspace (read-only-safe: a draft).
 *   status --name=NAME           Show the workspace's pending changes + conflicts.
 *
 * Usage:
 *   node gtm-workspace.mjs list
 *   node gtm-workspace.mjs create --name=agent-edits
 *   node gtm-workspace.mjs status --name=agent-edits
 */

import { getAccessToken, resolveContainer, tmGet, tmWrite, resolveWorkspace } from './_shared.mjs';

function parseFlags(argv) {
  const flags = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
  }
  return flags;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const accessToken = await getAccessToken();
  const { accountId, containerId, publicId } = await resolveContainer(accessToken);
  const parent = `accounts/${accountId}/containers/${containerId}`;

  if (!command || command === 'list') {
    const workspaces = (await tmGet(accessToken, `${parent}/workspaces`)).workspace || [];
    console.log(JSON.stringify({
      container: { publicId, accountId, containerId },
      workspaces: workspaces.map((w) => ({ workspaceId: w.workspaceId, name: w.name, description: w.description || null })),
    }, null, 2));
    return;
  }

  if (command === 'create') {
    if (!flags.name) throw new Error('--name=NAME is required.');
    const ws = await resolveWorkspace(accessToken, { accountId, containerId }, flags.name, { create: true });
    console.log(JSON.stringify({ created: { workspaceId: ws.workspaceId, name: ws.name } }, null, 2));
    return;
  }

  if (command === 'status') {
    if (!flags.name) throw new Error('--name=NAME is required.');
    const ws = await resolveWorkspace(accessToken, { accountId, containerId }, flags.name);
    const status = await tmGet(accessToken, `${parent}/workspaces/${ws.workspaceId}/status`);
    const changes = (status.workspaceChange || []).map((c) => ({
      changeStatus: c.changeStatus,
      type: c.tag ? 'tag' : c.trigger ? 'trigger' : c.variable ? 'variable' : c.folder ? 'folder' : 'other',
      name: (c.tag || c.trigger || c.variable || c.folder || {}).name || null,
    }));
    console.log(JSON.stringify({
      workspace: { workspaceId: ws.workspaceId, name: ws.name },
      mergeConflictCount: (status.mergeConflict || []).length,
      changeCount: changes.length,
      changes,
      note: 'These changes are STAGED, not live. A human must publish this workspace in the GTM UI.',
    }, null, 2));
    return;
  }

  throw new Error(`Unknown command "${command}". Use list | create | status.`);
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
