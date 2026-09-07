#!/usr/bin/env node
// Staging/export -> local only. Preview first; existing local files are protected.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fail = (message) => { throw new Error(message); };
function main(args) {
  const opt = { exclude: [], port: '22' };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (['--apply', '--delete', '--overwrite'].includes(flag)) { opt[flag.slice(2)] = true; continue; }
    if (!['--source', '--destination', '--kind', '--port', '--hosting', '--exclude', '--backup-dir'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) fail('Invalid arguments. Supply --source, --destination, and --kind plugins|mu-plugins. Writes require --apply; --overwrite and --delete each require --backup-dir.');
    const value = args[++i];
    if (flag === '--exclude') opt.exclude.push(value);
    else opt[flag.slice(2)] = value;
  }
  if (!['plugins', 'mu-plugins'].includes(opt.kind) || !opt.source || !opt.destination) fail('Supply --source, --destination, and --kind plugins|mu-plugins.');
  if (!/^\d+$/.test(opt.port) || +opt.port < 1 || +opt.port > 65535) fail('Invalid SSH port.');
  const dest = path.resolve(opt.destination);
  if (path.basename(dest) !== opt.kind || path.basename(path.dirname(dest)) !== 'wp-content') fail('Destination must be the local wp-content directory for the selected kind.');
  if (!fs.existsSync(dest) || !fs.lstatSync(dest).isDirectory()) fail('Create and inspect the local destination directory before previewing.');
  // Reject destination symlinks before a transfer can follow or replace them.
  for (let parent = dest; ; parent = path.dirname(parent)) {
    if (fs.lstatSync(parent).isSymbolicLink()) fail('Destination ancestors must not be symlinks. Select the real local path.');
    if (parent === path.dirname(parent)) break;
  }
  const inspect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) fail('The destination contains symlinks. Resolve their ownership before pulling.');
      if (entry.isDirectory()) inspect(path.join(dir, entry.name));
    }
  };
  inspect(dest);
  let source;
  if (opt.source.includes(':')) {
    // Keep remote-shell paths free of shell syntax, including on older rsync.
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*:[A-Za-z0-9_./-]+$/.test(opt.source)) fail('Use user@host:path with a plain remote path; shell syntax is not supported.');
    const remotePath = opt.source.slice(opt.source.indexOf(':') + 1).replace(/\/$/, '');
    if (remotePath.split('/').includes('..') || !remotePath.endsWith(`/wp-content/${opt.kind}`)) fail('Remote source must end in the selected wp-content directory.');
    source = opt.source.replace(/\/$/, '') + '/';
  } else {
    source = fs.realpathSync(opt.source);
    if (!fs.statSync(source).isDirectory()) fail('Local export source must be a directory.');
    if (dest === source || dest.startsWith(source + path.sep) || source.startsWith(dest + path.sep)) fail('Source and destination must not overlap.');
    source += '/';
  }
  const exclusions = ['index.php', ...opt.exclude];
  if (opt.kind === 'plugins') exclusions.push('disable-emails/');
  else {
    exclusions.push('0[0-9]-wp-env-*.php');
    if (opt.hosting === 'kinsta') exclusions.push('kinsta-mu-plugins/', 'kinsta-mu-plugins.php');
    if (opt.hosting === 'wpengine') exclusions.push('mu-plugin.php', 'force-strong-passwords/', 'slt-force-strong-passwords.php', 'wpe-cache-plugin*', 'wpe-update-source-selector*', 'wpe-wp-sign-on-plugin*', 'wpengine-common/', 'wpengine-security-auditor.php');
  }
  const transfer = ['-rlt', '--safe-links', '--checksum', '--itemize-changes', '--out-format=%i %n%L', '--timeout=60'];
  if (!opt.overwrite) transfer.push('--ignore-existing');
  if (opt.delete) transfer.push('--delete');
  if (opt.overwrite || opt.delete) {
    if (!opt['backup-dir']) fail('Overwriting or deleting requires a separate --backup-dir for recovery.');
    const backup = path.resolve(opt['backup-dir']);
    if (backup === dest || backup.startsWith(dest + path.sep) || dest.startsWith(backup + path.sep)) fail('The backup directory must be outside the destination tree.');
    if (!opt.source.includes(':') && (backup === source.slice(0, -1) || backup.startsWith(source))) fail('The backup directory must be outside the source tree.');
    if (fs.existsSync(backup)) fail('Use a new backup directory for each overwrite/delete operation.');
  }
  for (const pattern of exclusions) {
    if (/[\r\n\0]/.test(pattern)) fail('Each exclusion must be one pattern on one line.');
    transfer.push(`--exclude=${pattern}`);
  }
  if (opt.source.includes(':')) transfer.push('-e', `ssh -o BatchMode=yes -o ConnectTimeout=15 -p ${opt.port}`);
  const run = (dry) => {
    const result = spawnSync('rsync', [...transfer, ...(dry ? ['--dry-run'] : []), '--', source, dest + '/'], { encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) fail(dry ? 'Preview failed. No transfer was applied.' : 'Transfer failed or timed out; local files may be partially changed. Inspect the destination and backup before retrying.');
  };
  console.log(`Source: ${source}\nLocal destination: ${dest}\nMode: ${opt.overwrite ? 'overwrite' : 'preserve existing files'}; ${opt.delete ? 'delete missing files' : 'keep local-only files'}`);
  console.log('Preview:');
  run(true);
  if (!opt.apply) { console.log('Preview only. Add --apply when this exact file operation is authorized.'); return; }
  if (opt.overwrite || opt.delete) {
    // Take a complete local snapshot before rsync. In macOS openrsync, combining
    // --delete with --backup-dir can silently suppress deletions or fail backups.
    const backup = path.resolve(opt['backup-dir']);
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    fs.cpSync(dest, backup, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
    fs.chmodSync(backup, 0o700);
    console.log(`Local snapshot: ${backup}`);
  }
  console.log('Applying the selected options:');
  run(false);
  console.log('File transfer finished. Review local changes and verify required plugin files and local WordPress behavior.');
}
try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
