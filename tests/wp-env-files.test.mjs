import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = path.join(root, 'plugins/wordpress/skills/wp-env/scripts');
function fixture(t, kind = 'plugins') {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'wp env files ')));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const source = path.join(cwd, 'staging export/wp-content', kind);
  const dest = path.join(cwd, 'apps/wordpress/wp-content', kind);
  fs.mkdirSync(source, { recursive: true }); fs.mkdirSync(dest, { recursive: true });
  const put = (dir, file, value) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), value); };
  const run = (args = []) => spawnSync(process.execPath, [path.join(scripts, 'pull-files.mjs'), '--source', source, '--destination', dest, '--kind', kind, ...args], { cwd, encoding: 'utf8' });
  return { cwd, source, dest, put, run, backup: path.join(cwd, 'local backups/run1') };
}

test('preview and unattended apply preserve local edits and local-only plugins', (t) => {
  const f = fixture(t);
  f.put(f.source, 'tracked/main.php', 'from staging'); f.put(f.dest, 'tracked/main.php', 'local work');
  f.put(f.dest, 'local-only/main.php', 'keep'); f.put(f.source, 'missing/main.php', 'new');
  const preview = f.run();
  assert.equal(preview.status, 0, preview.stderr); assert.match(preview.stdout, /Preview only/);
  assert.ok(!fs.existsSync(path.join(f.dest, 'missing/main.php')));
  const applied = f.run(['--apply']);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(fs.readFileSync(path.join(f.dest, 'tracked/main.php'), 'utf8'), 'local work');
  assert.equal(fs.readFileSync(path.join(f.dest, 'local-only/main.php'), 'utf8'), 'keep');
  assert.equal(fs.readFileSync(path.join(f.dest, 'missing/main.php'), 'utf8'), 'new');
});

test('overwrite and deletion each require backups, and explicit apply saves replaced files', (t) => {
  const f = fixture(t);
  f.put(f.source, 'tracked/main.php', 'remote'); f.put(f.dest, 'tracked/main.php', 'edited');
  f.put(f.dest, 'obsolete.php', 'local-only');
  for (const flag of ['--overwrite', '--delete']) {
    const result = f.run([flag, '--apply']);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /backup-dir/);
  }
  const preview = f.run(['--overwrite', '--delete', '--backup-dir', f.backup]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /deleting.*obsolete.php/);
  assert.ok(!fs.existsSync(f.backup));
  const result = f.run(['--overwrite', '--delete', '--backup-dir', f.backup, '--apply']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.dest, 'tracked/main.php'), 'utf8'), 'remote');
  assert.ok(!fs.existsSync(path.join(f.dest, 'obsolete.php')));
  assert.equal(fs.readFileSync(path.join(f.backup, 'tracked/main.php'), 'utf8'), 'edited');
  assert.equal(fs.readFileSync(path.join(f.backup, 'obsolete.php'), 'utf8'), 'local-only');
  const reused = f.run(['--overwrite', '--backup-dir', f.backup, '--apply']);
  assert.notEqual(reused.status, 0); assert.match(reused.stderr, /new backup directory/);
});

test('delete does not also opt into overwriting', (t) => {
  const f = fixture(t);
  f.put(f.source, 'main.php', 'staging'); f.put(f.dest, 'main.php', 'local edit');
  f.put(f.dest, 'extra.php', 'extra');
  const result = f.run(['--delete', '--backup-dir', f.backup, '--apply']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.dest, 'main.php'), 'utf8'), 'local edit');
  assert.ok(!fs.existsSync(path.join(f.dest, 'extra.php')));
});

test('local email guard survives deletion and explicit project exclusions are respected', (t) => {
  const f = fixture(t);
  f.put(f.dest, 'disable-emails/main.php', 'local email guard');
  f.put(f.source, 'retired/main.php', 'excluded by project decision');
  f.put(f.source, 'runtime/main.php', 'needed even if removed from Git');
  const result = f.run(['--delete', '--backup-dir', f.backup, '--exclude', 'retired/', '--apply']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.dest, 'disable-emails/main.php'), 'utf8'), 'local email guard');
  assert.ok(!fs.existsSync(path.join(f.dest, 'retired')));
  assert.ok(fs.existsSync(path.join(f.dest, 'runtime/main.php')));
});

test('local mu helpers and host exclusions survive overwrite plus deletion', (t) => {
  const f = fixture(t, 'mu-plugins');
  for (const name of ['00-wp-env-url.php', '09-wp-env-custom.php']) {
    f.put(f.dest, name, 'local helper'); f.put(f.source, name, 'remote collision');
  }
  f.put(f.source, 'wpengine-common/main.php', 'host only');
  f.put(f.source, 'project-loader.php', 'project dependency');
  const result = f.run(['--hosting', 'wpengine', '--overwrite', '--delete', '--backup-dir', f.backup, '--apply']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.dest, '09-wp-env-custom.php'), 'utf8'), 'local helper');
  assert.ok(!fs.existsSync(path.join(f.dest, 'wpengine-common')));
  assert.ok(fs.existsSync(path.join(f.dest, 'project-loader.php')));
});

test('unsafe target and remote shell syntax stop before transfer', (t) => {
  const f = fixture(t);
  const remote = f.run(['--source', 'user@staging:/srv/$(touch bad)/wp-content/plugins', '--apply']);
  assert.notEqual(remote.status, 0); assert.match(remote.stderr, /shell syntax/);
  const badTarget = f.run(['--destination', f.cwd, '--apply']);
  assert.notEqual(badTarget.status, 0); assert.match(badTarget.stderr, /local wp-content/);
  fs.symlinkSync(f.source, path.join(f.dest, 'linked-plugin'));
  const linked = f.run(['--apply']);
  assert.notEqual(linked.status, 0); assert.match(linked.stderr, /symlinks/);
});

test('missing source is a failed preview and never a reason to delete local files', (t) => {
  const f = fixture(t); f.put(f.dest, 'keep.php', 'keep');
  fs.rmSync(f.source, { recursive: true });
  assert.notEqual(f.run(['--delete', '--backup-dir', f.backup, '--apply']).status, 0);
  assert.equal(fs.readFileSync(path.join(f.dest, 'keep.php'), 'utf8'), 'keep');
});

test('DB inventory detects missing site, network, and mu dependencies in a monorepo', (t) => {
  const f = fixture(t);
  f.put(f.dest, 'tracked/main.php', 'tracked');
  const content = path.dirname(f.dest), inventoryFile = path.join(f.cwd, 'required.json');
  const inventory = { active_plugins: ['tracked/main.php', 'profiles/main.php'], active_sitewide_plugins: { 'network/main.php': 1 }, mu_plugins: ['custom.php', 'custom/lib.php'] };
  fs.writeFileSync(inventoryFile, JSON.stringify(inventory));
  const check = () => spawnSync(process.execPath, [path.join(scripts, 'check-plugins.mjs'), content, inventoryFile], { encoding: 'utf8' });
  const missing = check();
  assert.equal(missing.status, 1); assert.match(missing.stdout, /4 missing/);
  assert.match(missing.stdout, /plugins\/profiles\/main.php/); assert.match(missing.stdout, /plugins\/network\/main.php/);
  for (const file of ['profiles/main.php', 'network/main.php']) f.put(f.dest, file, 'pulled');
  for (const file of inventory.mu_plugins) f.put(path.join(content, 'mu-plugins'), file, 'pulled');
  const satisfied = check();
  assert.equal(satisfied.status, 0, satisfied.stderr); assert.match(satisfied.stdout, /0 missing/);
  fs.writeFileSync(inventoryFile, JSON.stringify({ active_plugins: [] }));
  assert.equal(check().status, 2);
  inventory.active_plugins = ['../outside.php'];
  fs.writeFileSync(inventoryFile, JSON.stringify(inventory));
  assert.equal(check().status, 2);
});
