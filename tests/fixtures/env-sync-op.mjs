#!/usr/bin/env node
// Test double: all state is synthetic and local. Never connects to 1Password.
import fs from 'node:fs';
const args = process.argv.slice(2);
const file = process.env.TEST_ENV_SYNC_ITEM;
fs.appendFileSync(process.env.TEST_ENV_SYNC_CALLS, JSON.stringify(args) + '\n');
const current = JSON.parse(fs.readFileSync(file, 'utf8'));
const send = (value) => console.log(JSON.stringify(value));
if (args[0] === 'whoami') send({ email: 'fixture@example.test' });
else if (args[0] === 'vault' && args[1] === 'get') send({ id: 'fixture-vault', name: 'Env Variables & Secrets' });
else if (args[0] === 'item' && args[1] === 'get') {
  const reads = fs.readFileSync(process.env.TEST_ENV_SYNC_CALLS, 'utf8').trim().split('\n').map(JSON.parse).filter((call) => call[0] === 'item' && call[1] === 'get').length;
  if (current && process.env.TEST_ENV_SYNC_CONCURRENT_EDIT && reads === 2) {
    current.fields[0].value = 'Note changed by another editor';
    fs.writeFileSync(file, JSON.stringify(current));
  }
  if (process.env.TEST_ENV_SYNC_READ_ERROR) { console.error('Forbidden: request not authorized'); process.exitCode = 1; }
  else if (current) send(current);
  else { console.error("The requested name isn't an item."); process.exitCode = 1; }
} else if (args[0] === 'item' && args[1] === 'template') send({ category: 'SECURE_NOTE', fields: [{ id: 'notesPlain', type: 'STRING', purpose: 'NOTES', value: '' }] });
else if (args[0] === 'item' && ['edit', 'create'].includes(args[1])) {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  payload.id ||= 'fixture-item';
  payload.vault ||= { id: 'fixture-vault' };
  fs.writeFileSync(file, JSON.stringify(payload));
  if (process.env.TEST_ENV_SYNC_LOST_WRITE_RESPONSE) { console.error('Connection lost after write'); process.exit(1); }
  send(payload);
} else { console.error('Unexpected test command'); process.exitCode = 1; }
