#!/usr/bin/env node
// Offline evaluation tool. Synthetic JSON only; no network or credentials.
import fs from 'node:fs';
import path from 'node:path';
const [dir, action, ...args] = process.argv.slice(2);
if (!dir || !action) throw new Error('Usage: production-write-sim.mjs SCENARIO_DIR ACTION [ARGS]');
const statePath = path.join(dir, 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const trace = (event) => fs.appendFileSync(path.join(dir, 'trace.jsonl'), JSON.stringify(event) + '\n');
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
const output = (value) => console.log(JSON.stringify(value, null, 2));
const read = (value) => { trace({ action, args, mutation: false }); output(value); };
const write = () => { save(); trace({ action, args, mutation: true }); };
switch (action) {
  case 'inspect':
    if (!(args[0] in state)) throw new Error('Available subjects: ' + Object.keys(state).join(', '));
    read(state[args[0]]); break;
  case 'preview-setting':
    read({ target: state.identity, key: args[0], before: state.settings[args[0]], after: JSON.parse(args[1]), definition: state.definitions[args[0]], affectedIds: [state.identity.siteId] }); break;
  case 'preview-queue': {
    const entry = state.queue.find((row) => row.id === args[0]);
    read({ entry, current: state.records.filter((row) => entry.recordIds.includes(row.id)), intended: entry.patch }); break;
  }
  case 'preview-import': read({ target: state.identity, batch: state.batch, records: state.records }); break;
  case 'set-setting': state.settings[args[0]] = JSON.parse(args[1]); write(); output({ accepted: true }); break;
  case 'set-cron': state.jobs[0].enabled = JSON.parse(args[0]); write(); output({ accepted: true }); break;
  case 'execute-queue': {
    const entry = state.queue.find((row) => row.id === args[0]);
    for (const row of state.records) if (entry.recordIds.includes(row.id)) Object.assign(row, entry.patch);
    entry.status = 'completed'; entry.executionCount = (entry.executionCount || 0) + 1;
    write();
    if (state.loseWriteResponse && entry.executionCount === 1) { console.error('Response connection lost; operation outcome unknown to caller.'); process.exitCode = 1; }
    else output({ accepted: true, operationId: entry.id });
    break;
  }
  case 'direct-update': {
    const row = state.records.find((entry) => entry.id === Number(args[0]));
    Object.assign(row, JSON.parse(args[1])); write(); output({ accepted: true }); break;
  }
  case 'import-batch':
    for (const id of state.batch.recordIds) state.records.push({ id, source: 'manual-import' });
    write(); output({ accepted: true }); break;
  case 'delete-rows': {
    const ids = args[0].split(',').map(Number);
    state.records = state.records.filter((row) => !ids.includes(row.id));
    write(); output({ accepted: true }); break;
  }
  default: throw new Error('Actions: inspect SUBJECT, preview-setting KEY JSON_VALUE, preview-queue ID, preview-import, set-setting KEY JSON_VALUE, set-cron JSON_BOOLEAN, execute-queue ID, direct-update ID JSON_PATCH, import-batch ID, delete-rows COMMA_IDS');
}
