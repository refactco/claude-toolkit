import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'plugins/base/skills/sync-env-vars/scripts/sync-env.sh');
function fixture(t, { local = 'API_TOKEN=synthetic-new-token\nKEEP=unchanged\n', fields = { API_TOKEN: 'synthetic-old-token', KEEP: 'unchanged', REMOTE_ONLY: 'keep-me' }, example = '# Documentation that must survive\nAPI_TOKEN=\nKEEP=example-default # inline documentation\n' } = {}) {
  const cwd = fs.mkdtempSync(join(tmpdir(), 'refact env sync '));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const bin = join(cwd, 'bin'); fs.mkdirSync(bin);
  fs.copyFileSync(join(root, 'tests/fixtures/env-sync-op.mjs'), join(bin, 'op'));
  fs.chmodSync(join(bin, 'op'), 0o755);
  const itemPath = join(cwd, 'vault-item.json'), callsPath = join(cwd, 'calls.jsonl');
  fs.writeFileSync(itemPath, JSON.stringify(fields === null ? null : {
    id: 'fixture-item', title: 'Fixture - Local', category: 'SECURE_NOTE', vault: { id: 'fixture-vault' },
    fields: [{ id: 'notesPlain', purpose: 'NOTES', type: 'STRING', value: 'Keep this note' },
      ...Object.entries(fields).map(([label, value], i) => ({ id: `f${i}`, label, type: 'CONCEALED', value }))],
  }));
  if (local !== null) fs.writeFileSync(join(cwd, '.env'), local);
  if (example !== null) fs.writeFileSync(join(cwd, '.env.example'), example);
  const run = (args, extraEnv = {}) => spawnSync('bash', [script, ...args], { cwd, encoding: 'utf8', env: {
    ...process.env, PATH: bin + ':' + process.env.PATH, ENV_FILE: '', EXAMPLE_FILE: '', PROJECT_ITEM: '',
    TEST_ENV_SYNC_ITEM: itemPath, TEST_ENV_SYNC_CALLS: callsPath, ...extraEnv,
  } });
  const calls = () => fs.existsSync(callsPath) ? fs.readFileSync(callsPath, 'utf8').trim().split('\n').map(JSON.parse) : [];
  const item = () => JSON.parse(fs.readFileSync(itemPath, 'utf8'));
  const values = () => Object.fromEntries((item()?.fields || []).filter((field) => field.label).map((field) => [field.label, field.value]));
  return { cwd, run, calls, item, values, itemPath, file: (name) => fs.readFileSync(join(cwd, name), 'utf8') };
}
const writes = (calls) => calls.filter((args) => args[0] === 'item' && ['edit', 'create'].includes(args[1]));

test('one-key preview does not write files or vault, even with the legacy yes environment variable', (t) => {
  const f = fixture(t); const before = f.file('.env.example'), item = f.item();
  const r = f.run(['push', 'API_TOKEN'], { SYNC_ENV_ASSUME_YES: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Preview only/);
  assert.equal(f.file('.env.example'), before);
  assert.deepEqual(f.item(), item);
  assert.equal(writes(f.calls()).length, 0);
  assert.doesNotMatch(r.stdout + r.stderr, /synthetic-(new|old)-token/);
});

test('authorized one-key push preserves all other values, notes, and local file bytes', (t) => {
  const f = fixture(t); const before = f.file('.env.example'), local = f.file('.env');
  const r = f.run(['push', 'API_TOKEN', '--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(f.values(), { API_TOKEN: 'synthetic-new-token', KEEP: 'unchanged', REMOTE_ONLY: 'keep-me' });
  assert.equal(f.item().fields[0].value, 'Keep this note');
  assert.equal(f.file('.env.example'), before); assert.equal(f.file('.env'), local);
  assert.equal(writes(f.calls()).length, 1);
  assert.doesNotMatch(JSON.stringify(f.calls()), /synthetic-new-token/);
  assert.doesNotMatch(r.stdout + r.stderr, /synthetic-(new|old)-token/);
});

test('a full push previews deletion, then preserves example comments on explicit apply', (t) => {
  const f = fixture(t); const before = f.file('.env.example');
  const preview = f.run(['sync', '--source', 'env']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /REMOVE\tREMOTE_ONLY/);
  assert.equal(f.file('.env.example'), before); assert.equal(writes(f.calls()).length, 0);
  const result = f.run(['sync', '--source', 'env', '--yes']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.values(), { API_TOKEN: 'synthetic-new-token', KEEP: 'unchanged' });
  assert.match(f.file('.env.example'), /# Documentation that must survive/);
  assert.match(f.file('.env.example'), /KEEP=example-default # inline documentation/);
  assert.equal(parseEnv(f.file('.env.example')).API_TOKEN, '');
  assert.equal(f.item().fields[0].value, 'Keep this note');
});

test('different sources require an explicit direction regardless of file modification time', (t) => {
  const f = fixture(t); const before = f.file('.env.example');
  fs.utimesSync(join(f.cwd, '.env'), new Date(), new Date('2035-01-01'));
  const result = f.run(['sync', '--yes']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /AMBIGUOUS_DIRECTION/);
  assert.equal(writes(f.calls()).length, 0); assert.equal(f.file('.env.example'), before);
});

test('full pull is preview-only until authorized and preserves documentation when applied', (t) => {
  const f = fixture(t); const before = f.file('.env');
  assert.equal(f.run(['sync', '--source', 'vault']).status, 0);
  assert.equal(f.file('.env'), before);
  const applied = f.run(['sync', '--source', 'vault', '--yes']);
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual({ ...parseEnv(f.file('.env')) }, f.values());
  assert.equal(fs.statSync(join(f.cwd, '.env')).mode & 0o777, 0o600);
  assert.match(f.file('.env.example'), /Documentation that must survive/);
  assert.equal(writes(f.calls()).length, 0);
});

test('diff and key comparison never repair or rewrite headers', (t) => {
  const f = fixture(t); const before = f.file('.env.example');
  assert.equal(f.run(['diff']).status, 0);
  assert.equal(f.run(['keys-diff']).status, 0);
  assert.equal(f.file('.env.example'), before); assert.equal(writes(f.calls()).length, 0);
});

test('failed item lookup is not treated as a missing item or permission to create', (t) => {
  const f = fixture(t); const before = f.file('.env.example');
  const r = f.run(['push', 'API_TOKEN', '--yes'], { TEST_ENV_SYNC_READ_ERROR: '1' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /not treated as an empty or missing item/);
  assert.equal(writes(f.calls()).length, 0); assert.equal(f.file('.env.example'), before);
});

test('first key can create a Secure Note only with explicit apply', (t) => {
  const f = fixture(t, { fields: null });
  assert.equal(f.run(['push', 'API_TOKEN']).status, 0); assert.equal(f.item(), null);
  const r = f.run(['push', 'API_TOKEN', '--yes']);
  assert.equal(r.status, 0, r.stderr); assert.deepEqual(f.values(), { API_TOKEN: 'synthetic-new-token' });
  assert.equal(writes(f.calls())[0][1], 'create');
});

test('existing per-app headers select the requested project without creating root files', (t) => {
  const f = fixture(t, { local: null, example: null });
  for (const [dir, title] of [['apps/one', 'Fixture/One - Local'], ['apps/two', 'Fixture/Two - Local']]) {
    fs.mkdirSync(join(f.cwd, dir), { recursive: true });
    fs.writeFileSync(join(f.cwd, dir, '.env.example'), `# 1password_project: ${title}\nAPI_TOKEN=\n`);
    fs.writeFileSync(join(f.cwd, dir, '.env'), `API_TOKEN=synthetic-${dir.split('/')[1]}-token\n`);
  }
  const ambiguous = f.run(['push', 'API_TOKEN']);
  assert.notEqual(ambiguous.status, 0); assert.match(ambiguous.stderr, /Fixture\/One - Local/);
  const selected = f.run(['push', 'API_TOKEN', '--project', 'Fixture/Two - Local', '--yes']);
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(f.values().API_TOKEN, 'synthetic-two-token');
  assert.match(selected.stdout, /apps\/two/);
  assert.ok(!fs.existsSync(join(f.cwd, '.env'))); assert.ok(!fs.existsSync(join(f.cwd, '.env.example')));
});

test('pinning only the env file uses its sibling example and ignores tooling directories', (t) => {
  const f = fixture(t, { local: null, example: null });
  fs.mkdirSync(join(f.cwd, 'dashboard'));
  fs.writeFileSync(join(f.cwd, 'dashboard/.env'), 'API_TOKEN=synthetic-dashboard-token\n');
  fs.writeFileSync(join(f.cwd, 'dashboard/.env.example'), '# Keep this\nAPI_TOKEN=\n');
  fs.mkdirSync(join(f.cwd, '.claude/fixture'), { recursive: true });
  fs.writeFileSync(join(f.cwd, '.claude/fixture/.env.example'), '# ignore tooling\n');
  const r = f.run(['push', 'API_TOKEN', '--env-file', 'dashboard/.env', '--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.values().API_TOKEN, 'synthetic-dashboard-token');
  assert.equal(f.file('dashboard/.env.example'), '# Keep this\nAPI_TOKEN=\n');
  assert.ok(!fs.existsSync(join(f.cwd, '.env.example')));
});

test('quoted values, export prefixes, inline comments, and multiline values reach the vault unchanged', (t) => {
  const local = 'export API_TOKEN="synthetic # token" # explanation\nKEEP=unchanged # useful comment\nMULTILINE=\'first\nsecond\'\n';
  const f = fixture(t, { local });
  const r = f.run(['sync', '--source', 'env', '--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(f.values(), { ...parseEnv(local) });
  assert.doesNotMatch(r.stdout + r.stderr + JSON.stringify(f.calls()), /synthetic # token/);
});

test('multiline and quoted remote values round-trip to the local dotenv parser', (t) => {
  const fields = { API_TOKEN: 'value with # and "quotes"', MULTILINE: 'first\nsecond', BACKSLASH: 'literal\\ntext' };
  const f = fixture(t, { fields });
  const r = f.run(['sync', '--source', 'vault', '--yes']);
  assert.equal(r.status, 0, r.stderr); assert.deepEqual({ ...parseEnv(f.file('.env')) }, fields);
});

test('empty or duplicate local keys cannot silently clear or replace vault values', (t) => {
  const f = fixture(t, { local: 'API_TOKEN=\n' });
  assert.notEqual(f.run(['push', 'API_TOKEN', '--yes']).status, 0);
  assert.notEqual(f.run(['sync', '--source', 'env', '--yes']).status, 0);
  fs.writeFileSync(join(f.cwd, '.env'), 'API_TOKEN=first\nAPI_TOKEN=second\n');
  assert.notEqual(f.run(['push', 'API_TOKEN', '--yes']).status, 0);
  assert.equal(writes(f.calls()).length, 0);
});

test('a missing selected source and non-environment item category are left unchanged', (t) => {
  const f = fixture(t, { fields: null });
  assert.notEqual(f.run(['sync', '--source', 'vault', '--yes']).status, 0);
  fs.writeFileSync(f.itemPath, JSON.stringify({ id: 'fixture-item', category: 'LOGIN', fields: [] }));
  const result = f.run(['push', 'API_TOKEN', '--yes']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Secure Note/);
  assert.equal(writes(f.calls()).length, 0);
});

test('a concurrent vault edit stops a full-template write without overwriting the new note', (t) => {
  const f = fixture(t);
  const r = f.run(['push', 'API_TOKEN', '--yes'], { TEST_ENV_SYNC_CONCURRENT_EDIT: '1' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /changed after the preview/);
  assert.equal(f.item().fields[0].value, 'Note changed by another editor');
  assert.equal(f.values().API_TOKEN, 'synthetic-old-token');
  assert.equal(writes(f.calls()).length, 0);
});

test('an uncertain write response is reported and is never retried automatically', (t) => {
  const f = fixture(t);
  const r = f.run(['push', 'API_TOKEN', '--yes'], { TEST_ENV_SYNC_LOST_WRITE_RESPONSE: '1' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /may have applied/);
  assert.equal(writes(f.calls()).length, 1);
  assert.equal(f.values().API_TOKEN, 'synthetic-new-token');
});

test('code-only app discovery keeps distinct apps separate', (t) => {
  const f = fixture(t, { local: null, example: null });
  for (const app of ['one', 'two']) {
    fs.mkdirSync(join(f.cwd, 'apps', app, 'src'), { recursive: true });
    fs.writeFileSync(join(f.cwd, 'apps', app, 'src/server.js'), 'const key = process.env.API_TOKEN;');
  }
  const result = f.run(['sync', '--source', 'vault', '--yes']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Multiple app locations/);
  assert.match(result.stderr, /apps\/one/); assert.match(result.stderr, /apps\/two/);
  assert.ok(!fs.existsSync(join(f.cwd, 'apps/.env')));
  assert.equal(writes(f.calls()).length, 0);
});
