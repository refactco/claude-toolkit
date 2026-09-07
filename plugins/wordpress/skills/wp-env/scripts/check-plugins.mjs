#!/usr/bin/env node
// Check files against a captured DB/MU inventory; never infer it from local folders.
import fs from 'node:fs';
import path from 'node:path';
try {
  const [contentPath, inventoryPath, ...extra] = process.argv.slice(2);
  if (!contentPath || !inventoryPath || extra.length) throw new Error('Usage: check-plugins.mjs LOCAL_WP_CONTENT INVENTORY_JSON');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  if (!Array.isArray(inventory.active_plugins) || !Array.isArray(inventory.mu_plugins)
    || !inventory.active_sitewide_plugins || Array.isArray(inventory.active_sitewide_plugins) || typeof inventory.active_sitewide_plugins !== 'object') throw new Error('Inventory requires active_plugins and mu_plugins arrays plus an active_sitewide_plugins object. Do not substitute an empty list for a failed read.');
  const required = [
    ...new Set([...inventory.active_plugins, ...Object.keys(inventory.active_sitewide_plugins)])
  ].map((file) => ['plugins', file]).concat(inventory.mu_plugins.map((file) => ['mu-plugins', file]));
  for (const [, file] of required) if (typeof file !== 'string' || !file || path.isAbsolute(file) || file.split(/[\\/]/).some((part) => ['..', '.', ''].includes(part)) || /[\r\n\0]/.test(file)) throw new Error('Inventory contains an invalid relative file path.');
  let missing = 0;
  for (const [kind, file] of required) {
    const full = path.resolve(contentPath, kind, file);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) { console.log(`MISSING ${kind}/${file}`); missing++; }
  }
  console.log(`${required.length} required file(s) checked; ${missing} missing. This checks presence, not version or runtime compatibility.`);
  process.exitCode = missing ? 1 : 0;
} catch (error) { console.error(error.message); process.exitCode = 2; }
