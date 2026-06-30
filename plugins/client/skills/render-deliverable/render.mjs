#!/usr/bin/env node
/*
 * render-deliverable — scaffold a designed HTML render shell next to a markdown
 * deliverable, wired to the shared Refact design system (Inter + Source Serif 4,
 * claret accent, warm cream, print stylesheet). The shell fetches the .md at
 * runtime, so content stays single-sourced in the markdown.
 *
 *   node agent/skills/render-deliverable/render.mjs <path/to/deliverable.md> \
 *        [--title "Doc Title"] [--header "Running header"] [--force]
 *
 * Output: <same-dir>/<same-basename>.html. Then:
 *   python3 -m http.server 8765   # from project root
 *   open the .html under http://localhost:8765/… in Chrome → Cmd+P → Save as PDF.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(here, 'assets', 'shell.html');

const args = process.argv.slice(2);
let mdArg = null, title = null, header = null, force = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--force' || a === '-f') force = true;
  else if (a === '--title') title = args[++i];
  else if (a === '--header') header = args[++i];
  else if (a.startsWith('--title=')) title = a.slice('--title='.length);
  else if (a.startsWith('--header=')) header = a.slice('--header='.length);
  else if (!a.startsWith('-')) mdArg = a;
}

function fail(msg) { console.error(msg); process.exit(1); }

if (!mdArg) {
  fail('Usage: node render.mjs <path/to/deliverable.md> [--title "..."] [--header "..."] [--force]');
}

const mdPath = resolve(mdArg);
if (!mdPath.endsWith('.md')) fail(`Expected a .md file, got: ${mdArg}`);
if (!existsSync(mdPath)) fail(`Markdown not found: ${mdPath}`);

const mdFile = basename(mdPath);                       // fetched at runtime (sibling)
const outPath = join(dirname(mdPath), mdFile.replace(/\.md$/, '.html'));

if (existsSync(outPath) && !force) {
  fail(`Refusing to overwrite ${relative(process.cwd(), outPath)} — pass --force to replace it.`);
}

// Title: --title wins; else first H1 after frontmatter; else humanized filename.
const md = readFileSync(mdPath, 'utf8');
function deriveTitle() {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  const m = body.match(/^#\s+(.+?)\s*$/m);
  if (m) return m[1].replace(/[*_`]/g, '').trim();
  return basename(mdFile, '.md').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
const docTitle = title || deriveTitle();
const fullTitle = /refact/i.test(docTitle) ? docTitle : `${docTitle} | Refact`;
const runHeader = (header || docTitle).replace(/"/g, '”'); // keep CSS content:"" valid

let shell = readFileSync(TEMPLATE, 'utf8');
if (!shell.includes('__MD_FILE__')) fail('Template is missing placeholders — is assets/shell.html intact?');
shell = shell
  .replaceAll('__DOC_TITLE__', fullTitle)
  .replaceAll('__RUNNING_HEADER__', runHeader)
  .replaceAll('__MD_FILE__', mdFile);

writeFileSync(outPath, shell);

const rel = relative(process.cwd(), outPath);
console.log(`✓ Wrote ${rel}`);
console.log('  View it:');
console.log('    python3 -m http.server 8765        # from the project root');
console.log(`    open http://localhost:8765/${rel}  # then Cmd+P → Save as PDF`);
