#!/usr/bin/env node
/**
 * gtm-edit.mjs — create or update a tag, trigger, or variable in a GTM WORKSPACE.
 *
 * Authority model: "edit only, human publishes".
 *   - Edits land in a workspace (a draft). This script NEVER publishes and NEVER
 *     deletes — those code paths do not exist. A human reviews the workspace
 *     (gtm-workspace.mjs status) and publishes in the GTM UI.
 *   - Even though workspace edits aren't live, they modify shared team state, so
 *     each write is gated behind --confirm. Get the user's explicit written
 *     approval before passing it; never pass --confirm on their behalf.
 *
 * Flags:
 *   --type=tag|trigger|variable   (required)
 *   --action=create|update        (default: create)
 *   --workspace=NAME              Workspace to edit (default: agent-edits).
 *   --create-workspace            Create the workspace if it doesn't exist.
 *   --id=ENTITY_ID                Required for --action=update (tagId/triggerId/variableId).
 *   --data='{...}' | --data-file=PATH   The entity body (GTM resource shape).
 *   --confirm                     Required to actually write.
 *
 * Tip: run `gtm-export.mjs --full` to see the exact JSON shape of existing
 * tags/triggers/variables, then mirror it in --data.
 *
 * Examples:
 *   node gtm-edit.mjs --type=variable --data='{"name":"Const - Foo","type":"c","parameter":[{"type":"template","key":"value","value":"bar"}]}' --confirm
 *   node gtm-edit.mjs --type=tag --action=update --id=12 --data-file=tag.json --confirm
 */

import fs from 'node:fs';
import { getAccessToken, resolveContainer, resolveWorkspace, tmWrite } from './_shared.mjs';

const TYPES = {
  tag:      { collection: 'tags',      idField: 'tagId' },
  trigger:  { collection: 'triggers',  idField: 'triggerId' },
  variable: { collection: 'variables', idField: 'variableId' },
};

function parseFlags(argv) {
  const flags = { action: 'create', workspace: 'agent-edits', confirm: false, 'create-workspace': false };
  for (const a of argv) {
    if (a === '--confirm') { flags.confirm = true; continue; }
    if (a === '--create-workspace') { flags['create-workspace'] = true; continue; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
  }
  return flags;
}

function parseData(flags) {
  if (flags['data-file']) return JSON.parse(fs.readFileSync(flags['data-file'], 'utf8'));
  if (flags.data) {
    try { return JSON.parse(flags.data); }
    catch (e) { throw new Error(`--data is not valid JSON: ${e.message}`); }
  }
  throw new Error('Provide the entity body via --data=\'{...}\' (or --data-file=PATH).');
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const def = TYPES[flags.type];
  if (!def) throw new Error('--type must be tag, trigger, or variable.');
  if (!['create', 'update'].includes(flags.action)) {
    throw new Error('--action must be create or update. (Delete/publish are intentionally unsupported — do them in the GTM UI.)');
  }
  const body = parseData(flags);
  if (flags.action === 'update' && !flags.id) throw new Error('--id=ENTITY_ID is required for --action=update.');

  if (!flags.confirm) {
    throw new Error(
      `Refusing to ${flags.action} a ${flags.type} without --confirm. Show the user the exact ` +
      `entity JSON and target workspace, get their written approval, then re-run with --confirm. ` +
      `(This stages the change in a workspace; a human still publishes it.)`
    );
  }

  const accessToken = await getAccessToken();
  const { accountId, containerId, publicId } = await resolveContainer(accessToken);
  const ws = await resolveWorkspace(accessToken, { accountId, containerId }, flags.workspace, { create: flags['create-workspace'] });
  const wsPath = `accounts/${accountId}/containers/${containerId}/workspaces/${ws.workspaceId}/${def.collection}`;

  const result = flags.action === 'create'
    ? await tmWrite(accessToken, 'POST', wsPath, body)
    : await tmWrite(accessToken, 'PUT', `${wsPath}/${flags.id}`, body);

  console.log(JSON.stringify({
    container: { publicId, accountId, containerId },
    workspace: { workspaceId: ws.workspaceId, name: ws.name },
    action: flags.action,
    type: flags.type,
    entity: { id: result[def.idField], name: result.name, type: result.type },
    note: 'STAGED in the workspace, NOT live. Review with gtm-workspace.mjs status, then a human publishes in the GTM UI.',
  }, null, 2));
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
