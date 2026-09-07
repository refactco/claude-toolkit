#!/usr/bin/env node
// Keep the shell entrypoint stable; use JSON/stdin so values never enter argv or TSV.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseEnv, isDeepStrictEqual } from 'node:util';

const root = process.cwd();
const VAULT = 'Env Variables & Secrets';
const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const skipped = new Set(['.git', '.claude', '.codex', '.agents', '.cursor', 'agent', 'node_modules', 'vendor', '.next', 'dist', 'build']);
const fail = (message) => { throw new Error(message); };
const read = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const equal = (a, b) => a.size === b.size && [...a].every(([key, value]) => b.get(key) === value && b.has(key));

function options(args) {
  const command = args.shift();
  if (!['sync', 'push', 'diff', 'keys-diff'].includes(command)) fail('Usage: sync-env.sh {push KEY|sync|diff|keys-diff} [--project TITLE] [--env-file PATH] [--example-file PATH] [--source env|vault] [--yes]');
  const result = { command, yes: false, project: process.env.PROJECT_ITEM, envFile: process.env.ENV_FILE, exampleFile: process.env.EXAMPLE_FILE };
  if (command === 'push') {
    result.key = args.shift();
    if (!keyPattern.test(result.key || '')) fail('push requires one valid environment key.');
  }
  const flags = { '--project': 'project', '--env-file': 'envFile', '--example-file': 'exampleFile', '--source': 'source' };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--yes') { result.yes = true; continue; }
    if (!flags[flag] || !args.length || args[0].startsWith('--')) fail(`Invalid or incomplete option: ${flag}`);
    result[flags[flag]] = args.shift();
  }
  if (result.source && (command !== 'sync' || !['env', 'vault'].includes(result.source))) fail('--source env|vault is only valid for sync.');
  if (result.yes && !['sync', 'push'].includes(command)) fail('--yes is only valid for sync or push.');
  if (result.project && /[\r\n]/.test(result.project)) fail('The project item title must be one line.');
  return result;
}

// Retain comments and formatting as records. Reject ambiguous syntax before a write.
function document(source, label) {
  const lines = source.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) || [];
  const records = [], seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    if (/^[ \t]*(?:#|\r?\n|$)/.test(raw)) { records.push({ raw }); continue; }
    const match = /^([ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*)([^\r\n]*)/.exec(raw);
    if (!match) fail(`${label}:${i + 1}: unsupported dotenv syntax; no values were written.`);
    const [, prefix, key, rest] = match;
    if (seen.has(key)) fail(`${label}: duplicate key ${key}; resolve it before syncing.`);
    seen.add(key);
    let tail;
    if (/^['"`]/.test(rest)) {
      const quote = rest[0];
      while (raw.indexOf(quote, prefix.length + 1) < 0 && i + 1 < lines.length) raw += lines[++i];
      const end = raw.indexOf(quote, prefix.length + 1);
      if (end < 0) fail(`${label}: unclosed quoted value for ${key}.`);
      tail = raw.slice(end + 1).replace(/\r?\n$/, '');
      if (tail.trim() && !tail.trimStart().startsWith('#')) fail(`${label}: unexpected text after quoted value for ${key}.`);
    } else {
      tail = rest.includes('#') ? rest.slice(rest.indexOf('#')) : '';
    }
    records.push({ raw, key, prefix, comment: tail.includes('#') ? tail.slice(tail.indexOf('#')) : '' });
  }
  const values = new Map(Object.entries(parseEnv(source)));
  if (values.size !== seen.size || [...seen].some((key) => !values.has(key))) fail(`${label}: ambiguous dotenv syntax.`);
  return { source, records, values };
}

function header(file, name) {
  return read(file).match(new RegExp(`^[ \\t]*#[ \\t]*${name}:[ \\t]*([^\\r\\n]*)`, 'mi'))?.[1].trim();
}
function walk(dir, files = []) {
  if (fs.existsSync(path.join(dir, 'wp-config.php')) || fs.existsSync(path.join(dir, 'wp-content'))) return files;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink() || skipped.has(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, files);
    else if (item.isFile()) files.push(full);
  }
  return files;
}
function locations(opt) {
  if (opt.envFile || opt.exampleFile) {
    opt.envFile ||= path.join(path.dirname(opt.exampleFile), '.env');
    opt.exampleFile ||= path.join(path.dirname(opt.envFile), '.env.example');
  } else {
    const files = walk(root);
    let candidates = files.filter((file) => path.basename(file) === '.env.example');
    if (!candidates.length) candidates = files.filter((file) => path.basename(file) === '.env');
    let dirs = [...new Set(candidates.map((file) => path.dirname(file)))];
    if (dirs.length > 1 && opt.project) {
      const matched = dirs.filter((dir) => header(path.join(dir, '.env.example'), '1password_project') === opt.project);
      if (matched.length === 1) dirs = matched;
    }
    if (!dirs.length) {
      const accessor = /process\.env(?:\.[A-Za-z_]|\[['"])|import\.meta\.env\.|os\.(?:environ|getenv)|\bgetenv\(|\bENV\[|\benv\(/;
      dirs = [...new Set(files.filter((file) => /\.(?:[cm]?[jt]sx?|py|php|rb|vue|svelte)$/.test(file)
        && fs.statSync(file).size < 1024 * 1024 && accessor.test(read(file))).map((file) => {
        const parts = path.relative(root, file).split(path.sep);
        if (parts[0] === 'apps' && parts.length > 2) return path.join(root, parts[0], parts[1]);
        return parts.length > 1 ? path.join(root, parts[0]) : root;
      }))];
    }
    if (dirs.length > 1) {
      for (const dir of dirs) console.error(`Candidate: ${path.relative(root, dir) || '.'}; item: ${header(path.join(dir, '.env.example'), '1password_project') || '(no header)'}`);
      fail('Multiple app locations. Select one with --project TITLE or --env-file PATH and --example-file PATH.');
    }
    const dir = dirs[0] || root;
    opt.envFile = path.join(dir, '.env');
    opt.exampleFile = path.join(dir, '.env.example');
  }
  opt.envFile = path.resolve(opt.envFile);
  opt.exampleFile = path.resolve(opt.exampleFile);
  if (opt.envFile === opt.exampleFile) fail('The environment and example files must be different.');
  let dir = path.dirname(opt.envFile);
  while (dir.startsWith(root)) {
    if (fs.existsSync(path.join(dir, 'wp-config.php')) || fs.existsSync(path.join(dir, 'wp-content'))) fail('WordPress environment settings belong to the WordPress tooling.');
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  const pascal = (text) => text.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  const relative = path.relative(root, path.dirname(opt.envFile));
  const suffix = !relative ? '' : '/' + pascal(relative.split(path.sep)[0] === 'apps' ? relative.split(path.sep)[1] : path.basename(path.dirname(opt.envFile)));
  opt.project ||= header(opt.exampleFile, '1password_project') || `${pascal(path.basename(root))}${suffix} - Local`;
  console.log(`Env location: ${path.dirname(opt.envFile)}\nVault: ${VAULT}\nProject: ${opt.project}`);
}

function op(args, input) {
  return spawnSync('op', args, { input, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
}
function opJSON(args, input) {
  const result = op(args, input);
  if (result.status !== 0) fail(`1Password ${args.slice(0, 2).join(' ')} failed or timed out. Check authentication and access before retrying; no command output or secret values are shown.`);
  try { return JSON.parse(result.stdout); } catch { fail('1Password returned an invalid JSON response.'); }
}
function itemGet(title, vault) {
  const result = op(['item', 'get', title, '--vault', vault, '--format', 'json']);
  if (result.status === 0) {
    try { return JSON.parse(result.stdout); } catch { fail('1Password returned invalid item JSON.'); }
  }
  if (!result.error && /isn't an item|is not an item|no item matched|item[^\n]*not found/i.test(result.stderr)) return null;
  fail('The 1Password item could not be read. This is not treated as an empty or missing item. Check authentication, network access, and limits before retrying.');
}
const isEnvField = (field) => keyPattern.test(field.label || '') && !field.purpose && field.id !== 'notesPlain' && ['STRING', 'CONCEALED'].includes(field.type);
function itemValues(item) {
  const values = new Map();
  for (const field of item?.fields || []) {
    if (!isEnvField(field)) continue;
    if (values.has(field.label)) fail(`The vault item has duplicate fields named ${field.label}; select an unambiguous item.`);
    values.set(field.label, field.value || '');
  }
  return values;
}
function plan(source, target, targetName) {
  let changed = 0;
  for (const key of [...new Set([...source.keys(), ...target.keys()])].sort()) {
    const action = !source.has(key) ? 'REMOVE' : !target.has(key) ? 'ADD' : source.get(key) !== target.get(key) ? 'UPDATE' : 'SAME';
    if (action !== 'SAME') changed++;
    // The action conveys the difference; all values stay concealed, including short ones.
    console.log(`${action}\t${key}\t${target.has(key) ? '[set]' : '-'}\t${source.has(key) ? '[set]' : '-'}\t${targetName}`);
  }
  console.log(`SUMMARY: ${changed} key change(s)`);
  return changed;
}
function assignment(key, value) {
  for (const candidate of [`${key}=${value}\n`, `${key}='${value}'\n`, `${key}="${value}"\n`, `${key}=\`${value}\`\n`]) {
    try {
      const parsed = document(candidate, 'generated value').values;
      if (parsed.size === 1 && parsed.get(key) === value) return candidate;
    } catch { /* Try a different quoting form without exposing the value. */ }
  }
  fail(`Cannot represent ${key} losslessly in dotenv syntax. No local value file was written.`);
}
function render(doc, values, { example = false, project } = {}) {
  const seen = new Set();
  let output = '';
  const secret = /SECRET|PASSWORD|TOKEN|PRIVATE|API_KEY|ACCESS_KEY|CLIENT_SECRET|JWT|SESSION|COOKIE|SALT|DSN|DATABASE_URL|DB_URL|REDIS_URL|MONGO_URL/i;
  for (const record of doc.records) {
    if (!record.key) { output += record.raw; continue; }
    const { key } = record;
    seen.add(key);
    if (!values.has(key)) { if (record.comment) output += record.comment + '\n'; continue; }
    if ((example && (!secret.test(key) || doc.values.get(key) === '')) || (!example && doc.values.get(key) === values.get(key))) output += record.raw;
    else {
      let line = assignment(key, example ? '' : values.get(key));
      if (record.comment) line = line.replace(/\n$/, ` ${record.comment}\n`);
      output += line;
    }
  }
  for (const [key, value] of values) if (!seen.has(key)) {
    if (output && !output.endsWith('\n')) output += '\n';
    output += assignment(key, example ? '' : value);
  }
  if (example) {
    for (const [name, value] of [['1password_vault', VAULT], ['1password_project', project]]) {
      const pattern = new RegExp(`^[ \\t]*#[ \\t]*${name}:[^\\r\\n]*`, 'mi');
      output = pattern.test(output) ? output.replace(pattern, () => `# ${name}: ${value}`) : `# ${name}: ${value}\n` + output;
    }
  }
  const parsed = document(output, 'generated file').values;
  if (parsed.size !== values.size || [...values].some(([key, value]) => !parsed.has(key) || (!example && parsed.get(key) !== value))) fail('Generated dotenv validation failed; no file was written.');
  return output;
}
function atomicWrite(file, content, mode) {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fail('Refusing to replace a symlink; select the intended file explicitly.');
  const temp = path.join(path.dirname(file), `.env-sync-${randomUUID()}`);
  try {
    fs.writeFileSync(temp, content, { flag: 'wx', mode });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function writeItem(item, values, opt, vault, onlyKey) {
  // The documented JSON update route cannot round-trip passkeys. Env items use Secure Notes.
  if (item && item.category !== 'SECURE_NOTE') fail('Vault writes require a dedicated Secure Note environment item; other item categories are left unchanged.');
  const template = item ? structuredClone(item) : opJSON(['item', 'template', 'get', 'Secure Note', '--format', 'json']);
  template.title = item?.title || opt.project;
  template.fields ||= [];
  const touched = new Set();
  template.fields = template.fields.filter((field) => {
    if (!isEnvField(field) || (onlyKey && field.label !== onlyKey)) return true;
    if (!values.has(field.label)) return false;
    field.value = values.get(field.label);
    touched.add(field.label);
    return true;
  });
  for (const [key, value] of values) if ((!onlyKey || key === onlyKey) && !touched.has(key)) template.fields.push({ label: key, type: 'CONCEALED', value });
  // Detect an intervening edit before sending a complete JSON template. This is
  // a stale-read check, not an atomic compare-and-swap supported by the CLI.
  const snapshot = (value) => value && Object.fromEntries(['id', 'version', 'title', 'category', 'fields', 'sections', 'tags', 'urls', 'vault'].map((key) => [key, value[key]]));
  if (!isDeepStrictEqual(snapshot(item), snapshot(itemGet(item?.id || opt.project, vault)))) fail('The vault item changed after the preview. Nothing was written; inspect the current item and make a new plan.');
  const args = item ? ['item', 'edit', item.id, '--vault', vault, '--format', 'json'] : ['item', 'create', '-', '--vault', vault, '--format', 'json'];
  let saved;
  try { saved = opJSON(args, JSON.stringify(template)); }
  catch { fail('The vault write could not be confirmed. It may have applied; inspect the item before retrying.'); }
  const actual = itemValues(itemGet(saved.id || item?.id || opt.project, vault));
  if (!equal(values, actual)) fail('The vault write returned, but the expected values were not verified. Inspect the item before retrying.');
}

function main() {
  const opt = options(process.argv.slice(2));
  locations(opt);
  const envDoc = document(read(opt.envFile), opt.envFile);
  const exampleDoc = document(read(opt.exampleFile), opt.exampleFile);
  if (opt.command === 'keys-diff') {
    for (const key of envDoc.values.keys()) if (!exampleDoc.values.has(key)) console.log(`ONLY_ENV\t${key}`);
    for (const key of exampleDoc.values.keys()) if (!envDoc.values.has(key)) console.log(`ONLY_EXAMPLE\t${key}`);
    return;
  }
  if (op(['whoami']).status !== 0) fail('1Password is unavailable or not authenticated. Use secure local sign-in; do not paste credentials into chat.');
  const vault = opJSON(['vault', 'get', VAULT, '--format', 'json']).id;
  if (!vault) fail('Could not identify the configured 1Password vault.');
  const item = itemGet(opt.project, vault);
  const current = itemValues(item);
  if (opt.command === 'diff') { plan(envDoc.values, current, '1Password'); return; }
  if (opt.command === 'push') {
    if (!envDoc.values.has(opt.key) || !envDoc.values.get(opt.key)) fail(`${opt.key} has no non-empty local value; nothing was pushed.`);
    const intended = new Map(current).set(opt.key, envDoc.values.get(opt.key));
    const changes = plan(new Map([[opt.key, intended.get(opt.key)]]), new Map(current.has(opt.key) ? [[opt.key, current.get(opt.key)]] : []), '1Password');
    if (!changes) { console.log('The selected key already matches.'); return; }
    if (!opt.yes) { console.log('Preview only. Use --yes when this key update is authorized. Local files and other keys stay unchanged.'); return; }
    writeItem(item, intended, opt, vault, opt.key);
    console.log(`Verified ${opt.key} in 1Password. Local files were unchanged.`);
    return;
  }
  const hasEnv = fs.existsSync(opt.envFile);
  if (!hasEnv && !item) fail('BOOTSTRAP_REQUIRED: no local values or vault item found. Select the correct --project or prepare local values securely.');
  const source = opt.source || (!hasEnv ? 'vault' : !item ? 'env' : equal(envDoc.values, current) ? 'env' : null);
  if (!source) fail('AMBIGUOUS_DIRECTION: both sources differ. Choose --source env or --source vault; modification times do not authorize replacement. Use push KEY for one-key updates.');
  if ((source === 'env' && !hasEnv) || (source === 'vault' && !item)) fail(`Selected source ${source} does not exist.`);
  const values = source === 'env' ? envDoc.values : current;
  if (source === 'env' && [...values].some(([, value]) => value === '')) fail('Empty local values cannot clear vault fields. Fill or remove those keys before a full replacement.');
  const target = source === 'env' ? current : envDoc.values;
  console.log(`Full replacement: ${source} -> ${source === 'env' ? '1Password' : opt.envFile}. Missing source keys will be removed.`);
  const changes = plan(values, target, source === 'env' ? '1Password' : '.env');
  const nextExample = render(exampleDoc, values, { example: true, project: opt.project });
  const nextEnv = source === 'vault' ? render(envDoc, values) : envDoc.source;
  const localChanges = nextExample !== exampleDoc.source || nextEnv !== envDoc.source || !hasEnv;
  if (!changes && !localChanges) { console.log('Sources and declarations already match.'); return; }
  if (nextExample !== exampleDoc.source) console.log('The example declaration will be updated; documentation comments will be kept.');
  if (!opt.yes) { console.log('Preview only. Use --yes when this replacement plan is authorized. Nothing was written.'); return; }
  if (read(opt.envFile) !== envDoc.source || read(opt.exampleFile) !== exampleDoc.source) fail('A local file changed after the preview. Nothing was written; make a new plan.');
  // Check local targets before making the remote write.
  for (const file of [opt.exampleFile, ...(source === 'vault' ? [opt.envFile] : [])]) {
    if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) fail('Select regular local files before applying the replacement.');
    fs.accessSync(path.dirname(file), fs.constants.W_OK);
  }
  if (source === 'env' && (changes || !item)) writeItem(item, values, opt, vault);
  if (source === 'vault' && (nextEnv !== envDoc.source || !hasEnv)) atomicWrite(opt.envFile, nextEnv, 0o600);
  if (nextExample !== exampleDoc.source) atomicWrite(opt.exampleFile, nextExample, 0o644);
  console.log('Verified full sync. Comments were preserved; secret values were not printed.');
}

try { main(); } catch (error) {
  console.error(error.code ? `Local operation failed (${error.code}); check the selected paths and permissions.` : error.message);
  process.exitCode = 1;
}
