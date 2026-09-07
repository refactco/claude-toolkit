#!/usr/bin/env node
// Generate Codex metadata and package-local runtime notes from the Claude packs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some((arg) => arg !== '--check')) {
  throw new Error('Usage: node scripts/sync-codex.mjs [--check]');
}
const catalogPath = join(root, '.claude-plugin/marketplace.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const identifier = /^[A-Za-z0-9_-]+$/;
if (!identifier.test(catalog.name)) throw new Error('Invalid marketplace name');
const runtime = '<!-- Generated from shared/plugin-runtime.md. Do not edit here. -->\n\n'
  + readFileSync(join(root, 'shared/plugin-runtime.md'), 'utf8');
const names = new Set();
let changed = 0;
const emit = (path, contents) => {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === contents) return;
  changed++;
  if (check) {
    console.error(`Out of date: ${path.slice(root.length + 1)}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
};
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const entries = catalog.plugins.map((entry) => {
  if (!identifier.test(entry.name) || names.has(entry.name)) {
    throw new Error(`Invalid or duplicate plugin name: ${entry.name}`);
  }
  names.add(entry.name);
  if (entry.source !== `./plugins/${entry.name}`) {
    throw new Error(`Unexpected source for ${entry.name}`);
  }
  const pack = join(root, 'plugins', entry.name);
  const source = JSON.parse(readFileSync(join(pack, '.claude-plugin/plugin.json'), 'utf8'));
  if (source.name !== entry.name) throw new Error(`Plugin name mismatch: ${entry.name}`);
  // The pack manifest owns the version. Both catalogs are derived from it.
  entry.version = source.version;
  const label = `Refact ${entry.name === 'nextjs' ? 'Next.js' : entry.name === 'wordpress'
    ? 'WordPress' : entry.name[0].toUpperCase() + entry.name.slice(1)}`;
  emit(join(pack, '.codex-plugin/plugin.json'), json({
    name: source.name,
    version: source.version,
    description: `Refact ${entry.name} workflows for Claude Code and Codex.`,
    author: source.author,
    repository: 'https://github.com/refactco/claude-toolkit',
    keywords: source.keywords,
    skills: './skills/',
    interface: {
      displayName: label,
      shortDescription: `Use the Refact ${entry.name} skill pack.`,
      longDescription: `Shared Refact ${entry.name} skills, scripts, and references. `
        + 'Requires the local tools and service connections described by each skill.',
      developerName: source.author.name,
      category: 'Productivity',
      capabilities: [],
      defaultPrompt: `Use the Refact ${entry.name} skills for this project.`,
    },
  }));
  emit(join(pack, 'references/plugin-runtime.md'), runtime);
  return {
    name: entry.name,
    source: { source: 'local', path: entry.source },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Productivity',
  };
});
emit(catalogPath, json(catalog));
emit(join(root, '.agents/plugins/marketplace.json'), json({
  name: catalog.name,
  interface: { displayName: 'Refact Toolkit' },
  plugins: entries,
}));
if (check && changed) process.exitCode = 1;
console.log(`${check ? 'Checked' : 'Synced'} ${entries.length} packs; ${changed} file(s) ${check ? 'need changes' : 'changed'}.`);
