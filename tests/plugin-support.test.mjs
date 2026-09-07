import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('generation detects a missed release and repairs both catalogs without changing skill bodies', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'refact-release-'));
  try {
    for (const path of ['scripts', 'shared', 'plugins', '.claude-plugin', '.agents']) {
      cpSync(join(root, path), join(fixture, path), { recursive: true });
    }
    const run = (...args) => spawnSync(process.execPath, ['scripts/sync-codex.mjs', ...args], {
      cwd: fixture, encoding: 'utf8',
    });
    assert.equal(run('--check').status, 0);
    const sourcePath = join(fixture, 'plugins/base/.claude-plugin/plugin.json');
    const source = json(sourcePath);
    source.version = '9.9.9';
    writeFileSync(sourcePath, JSON.stringify(source, null, 2) + '\n');
    const skillPath = join(fixture, 'plugins/base/skills/refact-toolkit/SKILL.md');
    const skillBefore = readFileSync(skillPath, 'utf8');
    const catalogBefore = readFileSync(join(fixture, '.claude-plugin/marketplace.json'), 'utf8');
    assert.equal(run('--check').status, 1);
    assert.equal(readFileSync(join(fixture, '.claude-plugin/marketplace.json'), 'utf8'), catalogBefore);
    assert.equal(run().status, 0);
    assert.equal(json(join(fixture, 'plugins/base/.codex-plugin/plugin.json')).version, '9.9.9');
    assert.equal(json(join(fixture, '.claude-plugin/marketplace.json')).plugins[0].version, '9.9.9');
    assert.equal(readFileSync(skillPath, 'utf8'), skillBefore);
    assert.equal(run('--check').status, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('generation refuses duplicate plugin identities', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'refact-catalog-'));
  try {
    for (const path of ['scripts', 'shared', 'plugins', '.claude-plugin', '.agents']) {
      cpSync(join(root, path), join(fixture, path), { recursive: true });
    }
    const path = join(fixture, '.claude-plugin/marketplace.json');
    const catalog = json(path);
    catalog.plugins.push(catalog.plugins[0]);
    writeFileSync(path, JSON.stringify(catalog));
    const result = spawnSync(process.execPath, ['scripts/sync-codex.mjs', '--check'], {
      cwd: fixture, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /duplicate plugin name/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('preflight recognizes both Claude command spellings and respects existing config', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'refact preflight '));
  const script = join(root, 'plugins/base/hooks/preflight-refact-config.mjs');
  try {
    const run = (prompt) => spawnSync(process.execPath, [script], {
      cwd: fixture,
      env: { ...process.env, CLAUDE_PROJECT_DIR: fixture },
      input: JSON.stringify({ prompt }), encoding: 'utf8',
    });
    for (const prompt of ['/refact config', '/base:refact config']) {
      const result = run(prompt);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /was not found/);
    }
    assert.equal(run('Please review the project').stdout, '');
    assert.equal(run('/refactoring').stdout, '');
    writeFileSync(join(fixture, '.refact-os.json'), '{}');
    assert.equal(run('/base:refact config').stdout, '');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
