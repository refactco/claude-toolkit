import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'plugins/base/skills/git-workflow/scripts/check-state.mjs');
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'refact git state '));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('commit', '--allow-empty', '-m', 'fixture');
  git('switch', '-c', 'fix/task');
  const run = (...args) => spawnSync(process.execPath, [script, '--branch', 'fix/task', '--base', 'main', ...args], { cwd, encoding: 'utf8' });
  const stage = (name, contents = 'task change\n') => { writeFileSync(join(cwd, name), contents); git('add', '--', name); };
  return { cwd, git, run, stage };
}

test('the intended branch passes silently without changing branch, index, or files', (t) => {
  const { cwd, git, run, stage } = fixture(t);
  stage('task file.txt');
  const before = git('diff', '--cached', '--binary');
  const result = run('--commit', '--staged-path', 'task file.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout + result.stderr, '');
  assert.equal(git('branch', '--show-current').trim(), 'fix/task');
  assert.equal(git('diff', '--cached', '--binary'), before);
  assert.equal(readFileSync(join(cwd, 'task file.txt'), 'utf8'), 'task change\n');
});

test('a successful first commit check does not excuse a later switch onto main', (t) => {
  const { git, run, stage } = fixture(t);
  stage('first.txt');
  assert.equal(run('--commit', '--staged-path', 'first.txt').status, 0);
  git('commit', '-m', 'first task change');
  git('switch', 'main');
  git('merge', '--ff-only', 'fix/task');
  stage('second.txt');
  const head = git('rev-parse', 'HEAD');
  const result = run('--commit', '--staged-path', 'second.txt');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /shared branch/);
  assert.equal(git('rev-parse', 'HEAD'), head);
  assert.equal(git('diff', '--cached', '--name-only').trim(), 'second.txt');
});

test('another work branch and detached HEAD are rejected for commit and push', (t) => {
  const { git, run } = fixture(t);
  git('switch', '-c', 'fix/other');
  assert.match(run().stderr, /Branch changed/);
  assert.notEqual(run().status, 0);
  git('checkout', '--detach');
  assert.match(run().stderr, /Detached HEAD/);
  assert.notEqual(run().status, 0);
});

test('another staged file is rejected without unstaging or discarding it', (t) => {
  const { cwd, git, run, stage } = fixture(t);
  stage('ours.txt');
  stage('their\nfile.txt', 'other work\n');
  const before = git('diff', '--cached', '--binary');
  const result = run('--commit', '--staged-path', 'ours.txt');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unreviewed staged paths/);
  assert.equal(git('diff', '--cached', '--binary'), before);
  assert.equal(readFileSync(join(cwd, 'their\nfile.txt'), 'utf8'), 'other work\n');
});

test('unstaged unrelated work is preserved and does not block reviewed staged paths', (t) => {
  const { cwd, run, stage } = fixture(t);
  stage('ours.txt');
  writeFileSync(join(cwd, 'other.txt'), 'unfinished\n');
  assert.equal(run('--commit', '--staged-path', 'ours.txt').status, 0);
  assert.equal(readFileSync(join(cwd, 'other.txt'), 'utf8'), 'unfinished\n');
});

test('commit checks require staged work and an explicit file list', (t) => {
  const { run, stage } = fixture(t);
  assert.notEqual(run('--commit', '--staged-path', 'missing.txt').status, 0);
  stage('ours.txt');
  assert.notEqual(run('--commit').status, 0);
  assert.equal(run().status, 0); // A push check does not require a staged diff.
});
