#!/usr/bin/env node
// Read-only check immediately before a commit or push. Silent on success.
import { execFileSync } from 'node:child_process';

function check(args) {
  const options = { paths: [], commit: false };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === '--commit') { options.commit = true; continue; }
    if (!['--branch', '--base', '--staged-path'].includes(name) || !args[i + 1]
        || args[i + 1].startsWith('--')) {
      throw new Error('Usage: check-state.mjs --branch <work-branch> --base <shared-branch> [--commit --staged-path <file> ...]');
    }
    const value = args[++i];
    if (name === '--staged-path') options.paths.push(value.replace(/^\.\//, ''));
    else options[name.slice(2)] = value;
  }
  if (!options.branch || !options.base) throw new Error('Specify the intended work branch and shared base branch.');
  const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const branch = git('branch', '--show-current').trim();
  if (!branch) throw new Error('Detached HEAD: choose the intended work branch before continuing.');
  if (branch === options.base) throw new Error(`On shared branch ${branch}; use a work branch before continuing.`);
  if (branch !== options.branch) throw new Error(`Branch changed: expected ${options.branch}, found ${branch}.`);

  if (options.commit) {
    if (!options.paths.length) throw new Error('List the individual repository-relative files reviewed for this commit with --staged-path.');
    const staged = git('diff', '--cached', '--name-only', '--no-renames', '-z').split('\0').filter(Boolean);
    if (!staged.length) throw new Error('No staged changes to commit.');
    const allowed = new Set(options.paths);
    const unexpected = staged.filter((name) => !allowed.has(name));
    if (unexpected.length) throw new Error(`Unreviewed staged paths: ${unexpected.map((name) => JSON.stringify(name)).join(', ')}. Preserve them and isolate this task's changes.`);
  }
}

try {
  check(process.argv.slice(2));
} catch (error) {
  console.error(error.stderr?.toString().trim() || error.message);
  process.exitCode = 1;
}
