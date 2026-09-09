#!/usr/bin/env node
// asana.mjs — bundled with the base/asana skill
//
// Asana integration. Mirrors tasks into the configured asana.taskDir (default
// docs/task), reads exact stories, and handles requested comments/completion.
//
// Read modes:
//   - OPEN tasks      -> docs/task/open/<gid>.md    full detail (notes, custom
//                        fields, subtasks, attachments, comments).
//   - COMPLETED tasks -> docs/task/closed/<gid>.md  lightweight stub: task name
//                        + Asana link only. Pull full detail on demand.
//
// Write modes (--comment or --complete):
//   Posts a comment to a task. Since the token is a shared bot token, the
//   comment text is automatically prefixed with the git user's name so
//   attribution is clear in Asana. Example: "Masoud Golchin: <text>"
//   Completion changes only the named task and checks the saved state.
//   Use --help for subtask notes, attachment downloads, mentions, and previews.
//
// Only open tasks are fetched in full. Completed tasks are written as stubs
// straight from the single project task-list response, with no per-task API
// calls, so a project with a long completed history still syncs quickly.
//
// Idempotent (read mode): re-running updates files in place, moves them between
// open/ and closed/ as tasks change state, and preserves the `processed:` flag
// from any prior snapshot. Files left by the legacy docs/asana/ layout are
// migrated into the configured cache on the next sync (moved, not duplicated).
//
// Requires:
//   - Node 22 or newer. .refact-os.json -> `asana.projectId` is required only
//     for full project sync. A named task or story needs no configured project.
//   - An Asana personal access token, resolved in this order:
//       1. ASANA_TOKEN in the environment / .env (if set), else
//       2. the ASANA_TOKEN field of a shared 1Password item (default title
//          "ASANA TOKEN", override via .refact-os.json `asana.tokenItem`) in
//          the "Env Variables & Secrets" vault, read on demand via the op CLI.
//     The token is never written to .env or to a project item. op access is
//     set up by the sync-env-vars skill.
//
// Usage:
//   node ${CLAUDE_PLUGIN_ROOT}/skills/asana/scripts/asana.mjs                 # full project sync
//   node ${CLAUDE_PLUGIN_ROOT}/skills/asana/scripts/asana.mjs --dry-run       # show changes, write nothing
//   node ${CLAUDE_PLUGIN_ROOT}/skills/asana/scripts/asana.mjs --ticket <gid>  # one task, always full detail
//   node ${CLAUDE_PLUGIN_ROOT}/skills/asana/scripts/asana.mjs --comment --ticket <gid> --text "message"

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import path from "node:path";
// Resolve project paths from the working directory (where the skill is invoked),
// not from this script's location — the bundled copy lives deep under the plugin
// dir (plugins/base/skills/asana/scripts), so __dirname-relative paths would point
// inside the plugin instead of the user's project. Matches sentry.mjs.
const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = path.join(PROJECT_ROOT, ".refact-os.json");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");

// Synced tasks live alongside hand-authored tickets under docs/task/.
let TASK_DIR = path.join(PROJECT_ROOT, "docs", "task");
let OPEN_DIR = path.join(TASK_DIR, "open");
let CLOSED_DIR = path.join(TASK_DIR, "closed");
const generatedPaths = new Set();
// Legacy layout (pre-docs/task). Files here are migrated into docs/task/ on sync.
const LEGACY_OPEN_DIR = path.join(PROJECT_ROOT, "docs", "asana");
const LEGACY_CLOSED_DIR = path.join(LEGACY_OPEN_DIR, "closed");

// The fixed 1Password vault for env values & shared secrets, and the default
// item that carries the Asana token (override via .refact-os.json asana.tokenItem).
const OP_VAULT = "Env Variables & Secrets";
const DEFAULT_TOKEN_ITEM = "ASANA TOKEN";

const ASANA_BASE = process.env.ASANA_API_BASE || "https://app.asana.com/api/1.0";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

// Fields fetched per OPEN task (full detail).
const TASK_OPT_FIELDS = [
  "name",
  "notes",
  "completed",
  "completed_at",
  "completed_by.name",
  "completed_by.email",
  "created_at",
  "modified_at",
  "due_on",
  "due_at",
  "start_on",
  "start_at",
  "assignee.name",
  "assignee.gid",
  "assignee.email",
  "parent.gid",
  "parent.name",
  "projects.name",
  "memberships.section.name",
  "tags.name",
  "custom_fields.name",
  "custom_fields.display_value",
  "custom_fields.type",
  "num_subtasks",
  "permalink_url",
  "resource_subtype",
  "followers.name",
  "followers.gid",
].join(",");
// Fields fetched once for the whole project task list. Just enough to split
// open vs. completed and to write a completed-task stub (name + link) with no
// extra per-task request. `permalink_url` is intentionally omitted here (it is
// slow in bulk collections); stub links are built from the project + task gid.
const LIST_OPT_FIELDS = ["name", "completed", "completed_at"].join(",");
const STORY_OPT_FIELDS = [
  "created_at",
  "created_by.name",
  "created_by.email",
  "text",
  "html_text",
  "target.gid",
  "target.name",
  "type",
  "resource_subtype",
].join(",");
const SUBTASK_OPT_FIELDS = ["name", "gid", "completed"].join(",");
const ATTACHMENT_OPT_FIELDS = ["name", "permanent_url", "view_url", "host"].join(",");

function parseArgs(argv) {
  const args = { ticket: null, dryRun: false, comment: false, text: null, mentions: [] };
  const valueFlags = { "--ticket": "ticket", "-t": "ticket", "--story": "story", "--comment-id": "story", "--text": "text", "--text-file": "textFile", "--mention": "mentions" };
  const boolFlags = { "--dry-run": "dryRun", "--comment": "comment", "-c": "comment", "--complete": "complete", "--subtask-notes": "subtaskNotes", "--subtasks": "subtaskNotes", "--attachments": "attachments", "--notify": "notify", "--whoami": "whoami", "--help": "help", "-h": "help" };
  for (let i = 0; i < argv.length; i += 1) {
    const equal = argv[i].indexOf("=");
    const flag = equal < 0 ? argv[i] : argv[i].slice(0, equal);
    if (valueFlags[flag]) {
      const value = equal < 0 ? argv[++i] : argv[i].slice(equal + 1);
      if (value === undefined || !value.trim() || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
      const key = valueFlags[flag];
      if (key === "mentions") args.mentions.push(value.trim());
      else {
        if (args[key]) throw new Error(`${flag} was supplied more than once.`);
        args[key] = value.trim();
      }
    } else if (boolFlags[flag] && equal < 0) {
      args[boolFlags[flag]] = true;
    } else {
      throw new Error(`Unknown argument: ${flag}. Use --help.`);
    }
  }
  if (args.help) return args;
  for (const [label, value] of [["ticket", args.ticket], ["story", args.story], ...args.mentions.map(gid => ["mention", gid])]) {
    if (value) assertGid(value, label);
  }
  args.mentions = [...new Set(args.mentions)];
  if ([args.comment, args.complete, !!args.story, args.whoami].filter(Boolean).length > 1) throw new Error("Choose one operation: comment, complete, story, or whoami.");
  if ((args.comment || args.complete) && !args.ticket) throw new Error("Writes require --ticket <gid>.");
  if (args.comment && (!!args.text === !!args.textFile)) throw new Error("Comments require exactly one of --text or --text-file.");
  if (!args.comment && (args.text || args.textFile || args.mentions.length || args.notify)) throw new Error("Text and mention options require --comment.");
  if (args.notify && !args.mentions.length) throw new Error("--notify requires --mention <user-gid>.");
  if ((args.comment || args.complete || args.story || args.whoami) && (args.subtaskNotes || args.attachments)) throw new Error("Subtask notes and attachment downloads are task-read options.");
  if (args.whoami && args.ticket) throw new Error("--whoami does not take --ticket.");
  return args;
}

function assertGid(value, label = "GID") {
  if (!/^\d+$/.test(String(value))) throw new Error(`${label} must be a numeric Asana GID.`);
  return String(value);
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  return parseEnv(readFileSync(filePath, "utf8"));
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error();
    return config;
  } catch {
    throw new Error(".refact-os.json is not a valid JSON object. Fix it before running Asana.");
  }
}

function configurePaths(config) {
  const dir = config.asana?.taskDir ?? "docs/task";
  if (typeof dir !== "string" || !dir.trim() || path.isAbsolute(dir)) throw new Error("asana.taskDir must be a project-relative directory.");
  TASK_DIR = path.resolve(PROJECT_ROOT, dir);
  const relative = path.relative(PROJECT_ROOT, TASK_DIR);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || relative.split(path.sep).includes(".git")) throw new Error("asana.taskDir must be inside the project, outside .git.");
  OPEN_DIR = path.join(TASK_DIR, "open");
  CLOSED_DIR = path.join(TASK_DIR, "closed");
  assertSafePath(TASK_DIR);
}

// Read a single field from a 1Password item by label. Passing the vault and
// item as separate args (not an op:// reference) sidesteps reference-syntax
// limits — e.g. the "&" in the vault name, which op rejects in op:// URIs.
function opReadField(vault, item, field) {
  const out = execFileSync(
    "op",
    ["item", "get", item, "--vault", vault, "--fields", `label=${field}`, "--reveal", "--format", "json"],
    { encoding: "utf8", stdio: [process.stdin.isTTY ? "inherit" : "ignore", "pipe", "pipe"], timeout: 20_000, killSignal: "SIGKILL" },
  );
  const parsed = JSON.parse(out);
  const fields = Array.isArray(parsed) ? parsed : [parsed];
  const match = fields.find((f) => (f?.value ?? "") !== "");
  return (match?.value ?? "").trim();
}

function opErrorHint(err, item) {
  if (err && err.code === "ENOENT") return "the 1Password CLI (op) is not installed.";
  if (err?.code === "ETIMEDOUT") return "1Password unlock timed out. Run in a foreground terminal and unlock 1Password, or use an authenticated Asana connector with the same account and fields.";
  const msg = String((err && (err.stderr || err.message)) || err);
  if (/sign ?in|signed in|authenticat|OP_SERVICE_ACCOUNT_TOKEN|no account|not currently/i.test(msg)) {
    return "1Password (op) is not authenticated.";
  }
  if (/isn'?t an item|not found|no item matched|more than one item|no object matched/i.test(msg)) {
    return `couldn't read ASANA_TOKEN from item "${item}" in "${OP_VAULT}" — check the item title (set asana.tokenItem in .refact-os.json if it differs).`;
  }
  return "1Password could not provide the Asana token. Check the item and unlock it in a foreground terminal.";
}

// Resolve the Asana token without writing it to disk. Order:
//   1. A literal ASANA_TOKEN already in the environment / .env wins.
//   2. Otherwise read the ASANA_TOKEN field from the shared 1Password item
//      (default DEFAULT_TOKEN_ITEM, override via asana.tokenItem) on demand.
function resolveToken(env, config) {
  const literal = (env.ASANA_TOKEN || "").trim();
  if (literal && !literal.startsWith("op://")) return { token: literal, source: "env" };

  const item = (config.asana?.tokenItem || DEFAULT_TOKEN_ITEM).trim();
  try {
    const token = opReadField(OP_VAULT, item, "ASANA_TOKEN");
    if (token) return { token, source: `1Password item "${item}"` };
    return { token: "", source: null, error: `the ASANA_TOKEN field is empty in 1Password item "${item}".` };
  } catch (err) {
    return { token: "", source: null, error: opErrorHint(err, item) };
  }
}

function die(message, code = 1) {
  process.stderr.write(`asana: ${message}\n`);
  process.exit(code);
}

function resolveGitUserName() {
  try {
    return execFileSync("git", ["config", "user.name"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

async function asanaRequest(token, method, urlPath, params = {}, body) {
  const url = new URL(`${ASANA_BASE}${urlPath}`);
  assertDownloadProtocol(url);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  }
  let attempt = 0;
  while (true) {
    attempt += 1;
    const res = await fetch(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after") || 2);
      if (!Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > 30) throw new Error("Asana rate limit: retry later (Retry-After exceeds this command's wait limit).");
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw Object.assign(new Error(`Asana ${res.status} for ${method} ${url.pathname}. Check access and request fields.`), { status: res.status });
    }
    return res.json();
  }
}

async function asanaFetch(token, urlPath, params = {}) {
  return asanaRequest(token, "GET", urlPath, params);
}

async function asanaPost(token, urlPath, body) {
  return asanaRequest(token, "POST", urlPath, {}, body);
}

async function* paginate(token, urlPath, params) {
  let offset;
  const seenOffsets = new Set();
  while (true) {
    const page = await asanaFetch(token, urlPath, { ...params, offset });
    if (!Array.isArray(page.data)) throw new Error(`Asana returned an incomplete collection for ${urlPath}.`);
    for (const item of page.data) {
      assertGid(item.gid);
      yield item;
    }
    const next = page.next_page?.offset;
    if (!next) return;
    if (seenOffsets.has(next)) throw new Error(`Asana pagination repeated an offset for ${urlPath}.`);
    seenOffsets.add(next);
    offset = next;
  }
}

// One paginated pass over the project. Returns compact task records
// ({ gid, name, completed, completed_at }) — enough to stub completed tasks
// without a per-task request, and to know which tasks need a full fetch.
async function fetchProjectTasks(token, projectGid) {
  const tasks = [];
  for await (const t of paginate(token, `/projects/${projectGid}/tasks`, {
    completed_since: "2000-01-01T00:00:00.000Z",
    limit: 100,
    opt_fields: LIST_OPT_FIELDS,
  })) {
    tasks.push(t);
  }
  return tasks;
}

async function fetchTask(token, gid) {
  assertGid(gid);
  const detail = await asanaFetch(token, `/tasks/${gid}`, { opt_fields: TASK_OPT_FIELDS });
  if (detail.data?.gid !== String(gid) || typeof detail.data.completed !== "boolean") throw new Error(`Asana returned an incomplete or wrong task for ${gid}.`);
  return detail.data;
}

async function fetchStory(token, gid, taskGid) {
  const result = await asanaFetch(token, `/stories/${assertGid(gid)}`, { opt_fields: STORY_OPT_FIELDS });
  const story = result.data;
  if (story?.gid !== String(gid)) throw new Error(`Asana returned the wrong story for ${gid}.`);
  if (taskGid && story.target?.gid !== taskGid) throw new Error(`Story ${gid} does not belong to task ${taskGid}.`);
  return story;
}

async function fetchStories(token, gid) {
  const out = [];
  for await (const s of paginate(token, `/tasks/${gid}/stories`, {
    limit: 100,
    opt_fields: STORY_OPT_FIELDS,
  })) {
    out.push(s);
  }
  return out;
}

async function fetchSubtasks(token, gid, withNotes) {
  const out = [];
  for await (const s of paginate(token, `/tasks/${gid}/subtasks`, {
    limit: 100,
    opt_fields: withNotes ? `${SUBTASK_OPT_FIELDS},notes,assignee.name,assignee.email,due_on` : SUBTASK_OPT_FIELDS,
  })) {
    out.push(s);
  }
  return out;
}

async function fetchAttachments(token, gid) {
  const out = [];
  for await (const a of paginate(token, `/tasks/${gid}/attachments`, {
    limit: 100,
    opt_fields: ATTACHMENT_OPT_FIELDS,
  })) {
    out.push(a);
  }
  return out;
}

// Reject symlinks and paths outside the project before touching cache files.
function assertSafePath(filePath) {
  const relative = path.relative(PROJECT_ROOT, filePath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Cache path is outside the project.");
  let current = PROJECT_ROOT;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Cache path contains a symbolic link: ${current}`);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}

function assertOwned(filePath, gid, kind = "task") {
  assertSafePath(filePath);
  if (!existsSync(filePath)) return;
  const header = readFileSync(filePath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "";
  const key = kind === "story" ? "asana-story-gid" : "asana-gid";
  if (!/^source: asana\r?$/m.test(header) || !header.split(/\r?\n/).includes(`${key}: ${gid}`)) {
    throw new Error(`Refusing to overwrite a file not generated for this Asana ${kind}: ${filePath}`);
  }
}

function atomicWrite(filePath, content) {
  assertSafePath(filePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  let created = false;
  try {
    writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    created = true;
    renameSync(temporary, filePath);
  } finally {
    if (created && existsSync(temporary)) unlinkSync(temporary);
  }
}

function rememberGenerated(filePath) {
  // Exact generated paths avoid hiding hand-written files beside the cache.
  const relative = path.relative(TASK_DIR, filePath).split(path.sep).join("/");
  generatedPaths.add(`/${relative.replace(/[\\*?\[\]#! ]/g, "\\$&")}`);
}

function flushGitignore() {
  if (!generatedPaths.size) return;
  const file = path.join(TASK_DIR, ".gitignore");
  assertSafePath(file);
  const original = existsSync(file) ? readFileSync(file, "utf8") : "";
  const existing = new Set(original.split(/\r?\n/));
  const missing = [...generatedPaths].filter(line => !existing.has(line)).sort();
  if (!missing.length) return;
  const heading = original.includes("# Asana generated cache files") ? "" : "# Asana generated cache files\n";
  atomicWrite(file, `${original}${original && !original.endsWith("\n") ? "\n" : ""}${heading}${missing.join("\n")}\n`);
}

function assertDownloadProtocol(url) {
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) throw new Error("Asana URLs require HTTPS (HTTP is allowed for a local test server).");
}

async function downloadAttachments(token, taskGid, attachments, dryRun) {
  for (const attachment of attachments) {
    const gid = assertGid(attachment.gid, "attachment");
    const detail = (await asanaFetch(token, `/attachments/${gid}`, { opt_fields: "name,download_url,host,parent.gid" })).data;
    if (detail?.gid !== gid || (detail.parent?.gid && detail.parent.gid !== taskGid)) throw new Error(`Attachment ${gid} does not match the requested task.`);
    if (!detail.download_url) throw new Error(`Attachment ${gid} has no direct download. Use its linked provider; the task snapshot still includes its link.`);
    const url = new URL(detail.download_url);
    assertDownloadProtocol(url);
    const name = path.basename(String(detail.name || "attachment").replaceAll("\\", "/")).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 140) || "attachment";
    const destination = path.join(TASK_DIR, "attachments", taskGid, `${gid}-${name}`);
    assertSafePath(destination);
    if (dryRun) {
      process.stdout.write(`  would-download attachment ${gid} to ${path.relative(PROJECT_ROOT, destination)}\n`);
      continue;
    }
    // Signed download URLs are separate from the API. Never forward the token.
    // Check each redirect explicitly so HTTPS cannot silently downgrade.
    let downloadUrl = url;
    let response;
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      response = await fetch(downloadUrl, { redirect: "manual", signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 5) throw new Error(`Attachment ${gid} has an invalid redirect.`);
      downloadUrl = new URL(location, downloadUrl);
      assertDownloadProtocol(downloadUrl);
    }
    if (!response.ok) throw new Error(`Attachment ${gid} download failed with HTTP ${response.status}.`);
    if (Number(response.headers.get("content-length")) > MAX_ATTACHMENT_BYTES) {
      await response.body?.cancel();
      throw new Error(`Attachment ${gid} exceeds the 100 MiB download limit.`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_ATTACHMENT_BYTES) throw new Error(`Attachment ${gid} exceeds the 100 MiB download limit.`);
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (existsSync(destination) && !readFileSync(destination).equals(bytes)) throw new Error(`Attachment ${gid} differs from the existing local file; keep that file and choose a fresh cache directory.`);
    if (!existsSync(destination)) atomicWrite(destination, bytes);
    rememberGenerated(destination);
    process.stdout.write(`  downloaded attachment ${gid}: ${size} bytes, ${path.relative(PROJECT_ROOT, destination)}\n`);
  }
}

const xmlEscape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

async function writeComment(token, args) {
  const text = args.textFile ? readFileSync(path.resolve(PROJECT_ROOT, args.textFile), "utf8").trim() : args.text;
  if (!text) throw new Error("Comment text is empty.");
  const author = resolveGitUserName();
  if (!author) throw new Error("git user.name is missing; configure the actual author's name before posting.");
  const task = await fetchTask(token, args.ticket);
  for (const gid of args.mentions) {
    const user = (await asanaFetch(token, `/users/${gid}`, { opt_fields: "name" })).data;
    if (user?.gid !== gid) throw new Error(`Could not verify mention user ${gid}.`);
  }
  const followers = new Set((task.followers || []).map(user => user.gid));
  if (task.assignee?.gid) followers.add(task.assignee.gid);
  const missing = args.mentions.filter(gid => !followers.has(gid));
  if (missing.length && !args.notify) throw new Error(`Mention users ${missing.join(", ")} do not follow this task. Use --notify when authorized to add them as followers and notify them.`);
  const attributed = `${author}: ${text}`;
  const data = args.mentions.length
    ? { html_text: `<body>${xmlEscape(attributed)}\n\ncc ${args.mentions.map(gid => `<a data-asana-gid="${gid}"/>`).join(" ")}</body>` }
    : { text: attributed };
  if (args.dryRun) {
    process.stdout.write(`Would post an attributed comment on task ${args.ticket}${missing.length ? ` and add followers ${missing.join(", ")}` : ""}. No writes.\n`);
    return;
  }
  if (missing.length) {
    await asanaPost(token, `/tasks/${args.ticket}/addFollowers`, { data: { followers: missing } });
    process.stdout.write(`Requested followers ${missing.join(", ")}; checking membership before posting.\n`);
    let membershipVerified = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const updated = await fetchTask(token, args.ticket);
      if (missing.every(gid => (updated.followers || []).some(user => user.gid === gid) || updated.assignee?.gid === gid)) {
        membershipVerified = true;
        break;
      }
    }
    if (!membershipVerified) throw new Error("Follower membership could not be verified; no comment was posted.");
  }
  let posted;
  try {
    posted = (await asanaPost(token, `/tasks/${args.ticket}/stories`, { data })).data;
  } catch (err) {
    throw new Error(`Comment request failed or its result is uncertain (${err.message}). Do not retry blindly; read this task's stories first.`);
  }
  const gid = assertGid(posted?.gid, "posted story");
  process.stdout.write(`Posted comment ${gid} on task ${args.ticket}; checking its saved content.\n`);
  const saved = await fetchStory(token, gid, args.ticket);
  if (!saved.text?.includes(attributed)) throw new Error(`Comment ${gid} exists but its saved text could not be verified. Do not post a duplicate.`);
  if (args.mentions.some(id => !new RegExp(`data-asana-gid=["']${id}["']`).test(saved.html_text || ""))) throw new Error(`Comment ${gid} exists but its mention links could not be verified. Do not post a duplicate.`);
  process.stdout.write(`Verified comment ${gid}${args.mentions.length ? " and its mention links (recipient delivery is not observable through this API)" : ""}.\n  ${taskPermalink(task)}\n`);
}

async function completeTask(token, args) {
  const before = await fetchTask(token, args.ticket);
  if (args.dryRun) {
    process.stdout.write(`${before.completed ? "Already complete" : "Would mark complete"}: task ${args.ticket}. No writes.\n`);
    return;
  }
  let requestError;
  if (!before.completed) {
    try {
      await asanaRequest(token, "PUT", `/tasks/${args.ticket}`, {}, { data: { completed: true } });
    } catch (err) {
      requestError = err;
    }
  }
  const saved = await fetchTask(token, args.ticket);
  if (!saved.completed) throw new Error(`Task ${args.ticket} is not confirmed complete${requestError ? ` (${requestError.message})` : ""}. No retry was sent.`);
  process.stdout.write(`Verified task ${args.ticket} is complete${before.completed ? " (already complete; no update sent)" : requestError ? " (update response failed; saved state checked)" : ""}.\n  ${taskPermalink(saved)}\n`);
  await processFullTask(token, args.ticket, { dryRun: false });
}

async function readSingleStory(token, args) {
  const story = await fetchStory(token, args.story, args.ticket);
  const destination = path.join(TASK_DIR, "stories", `${args.story}.md`);
  assertOwned(destination, args.story, "story");
  const content = ["---", "source: asana", `asana-story-gid: ${story.gid}`, `asana-task-gid: ${story.target?.gid || ""}`, "---", "", `# Asana story ${story.gid}`, "", `**Author:** ${story.created_by?.name || "Unknown"}`, `**Date:** ${story.created_at || ""}`, `**Type:** ${story.resource_subtype || story.type || ""}`, `**Task:** ${story.target?.name || ""} (${story.target?.gid || "unknown"})`, "", story.text || "", ""].join("\n");
  if (!args.dryRun) {
    atomicWrite(destination, content);
    rememberGenerated(destination);
  }
  process.stdout.write(`${args.dryRun ? "Would save" : "Saved"} exact story ${story.gid}: ${path.relative(PROJECT_ROOT, destination)}\n`);
}

function readPreservedProcessed(filePath) {
  if (!existsSync(filePath)) return false;
  const text = readFileSync(filePath, "utf8");
  const m = text.match(/^---[\s\S]*?\nprocessed:\s*(true|false)\s*\n[\s\S]*?---/m);
  return m ? m[1] === "true" : false;
}

// Look for an existing file for this gid in the current layout first, then the
// legacy docs/asana/ layout. A hit in a legacy path is treated as a normal
// "existing" file, so the next write moves it into docs/task/.
function findExistingFile(gid) {
  const candidates = [
    path.join(OPEN_DIR, `${gid}.md`),
    path.join(CLOSED_DIR, `${gid}.md`),
    path.join(LEGACY_OPEN_DIR, `${gid}.md`),
    path.join(LEGACY_CLOSED_DIR, `${gid}.md`),
  ];
  for (const candidate of candidates) {
    assertSafePath(candidate);
    if (existsSync(candidate)) {
      assertOwned(candidate, gid);
      return { path: candidate };
    }
  }
  return null;
}

function taskPermalink(task, projectGid) {
  if (task.permalink_url) return task.permalink_url;
  if (projectGid) return `https://app.asana.com/0/${projectGid}/${task.gid}`;
  return `https://app.asana.com/0/0/${task.gid}`;
}

// Full markdown for an open task (or an explicitly requested single task).
function renderMarkdown(task, stories, subtasks, attachments) {
  const statusLabel = task.completed ? "Completed" : "Open";
  const assignee = task.assignee
    ? `${task.assignee.name}${task.assignee.email ? ` (${task.assignee.email})` : ""}`
    : "Unassigned";
  const due = task.due_at || task.due_on || "—";
  const start = task.start_at || task.start_on || "—";
  const section = task.memberships?.[0]?.section?.name;
  const tags = (task.tags || []).map((t) => t.name).filter(Boolean);
  const headerLines = [
    "---",
    "source: asana",
    "added-by: asana.mjs",
    `processed: ${task._preservedProcessed ? "true" : "false"}`,
    `asana-gid: ${task.gid}`,
    `asana-permalink: ${task.permalink_url || ""}`,
    `asana-modified-at: ${task.modified_at || ""}`,
    `asana-completed: ${task.completed ? "true" : "false"}`,
    "---",
    "",
  ];
  const lines = [];
  lines.push(`# ${task.name || "(untitled)"}`);
  lines.push("");
  lines.push(
    `**Status:** ${statusLabel} · **Assignee:** ${assignee} · **Due:** ${due} · **Start:** ${start}`,
  );
  if (section) lines.push(`**Section:** ${section}`);
  if (tags.length) lines.push(`**Tags:** ${tags.join(", ")}`);
  if (task.parent?.gid) {
    lines.push(`**Parent task:** ${task.parent.name || ""} (gid: ${task.parent.gid})`);
  }
  if (task.completed_at) {
    const by = task.completed_by?.name ? ` by ${task.completed_by.name}` : "";
    lines.push(`**Completed at:** ${task.completed_at}${by}`);
  }
  lines.push("");
  if (task.notes) {
    lines.push("## Notes");
    lines.push("");
    lines.push(task.notes);
    lines.push("");
  }
  const customFields = (task.custom_fields || []).filter((cf) => cf.display_value);
  if (customFields.length) {
    lines.push("## Custom fields");
    lines.push("");
    for (const cf of customFields) {
      lines.push(`- **${cf.name}:** ${cf.display_value}`);
    }
    lines.push("");
  }
  if (subtasks.length) {
    lines.push(`## Subtasks (${subtasks.length})`);
    lines.push("");
    for (const s of subtasks) {
      const box = s.completed ? "[x]" : "[ ]";
      lines.push(`- ${box} ${s.name || "(untitled)"} \`gid:${s.gid}\``);
      if (s.notes !== undefined) {
        lines.push(`  - Assignee: ${s.assignee?.name || "Unassigned"}; due: ${s.due_on || "—"}`);
        lines.push(...(s.notes || "(No description)").split("\n").map(line => `    ${line}`));
      }
    }
    lines.push("");
  }
  if (attachments.length) {
    lines.push(`## Attachments (${attachments.length})`);
    lines.push("");
    for (const a of attachments) {
      const url = a.permanent_url || a.view_url || "";
      lines.push(`- [${a.name || "attachment"}](${url})${a.host ? ` _(${a.host})_` : ""}`);
    }
    lines.push("");
  }
  if (stories.length) {
    lines.push(`## Comments / activity (${stories.length})`);
    lines.push("");
    for (const s of stories) {
      const author = s.created_by?.name || "Unknown";
      const subtype = s.resource_subtype || s.type || "";
      lines.push(`### ${s.created_at || ""} — ${author} _(${subtype})_`);
      lines.push("");
      lines.push(`Story GID: \`${s.gid}\``);
      lines.push("");
      if (s.text) {
        lines.push(s.text);
        lines.push("");
      }
    }
  }
  return headerLines.join("\n") + lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// Lightweight stub: preserve a known review flag; new stubs default to processed.
function renderStub(task, projectGid) {
  const permalink = taskPermalink(task, projectGid);
  const headerLines = [
    "---",
    "source: asana",
    "added-by: asana.mjs",
    `processed: ${task._preservedProcessed ?? true}`,
    `asana-gid: ${task.gid}`,
    `asana-permalink: ${permalink}`,
    "asana-completed: true",
    `asana-completed-at: ${task.completed_at || ""}`,
    "asana-stub: true",
    "---",
    "",
  ];
  const lines = [
    `# ${task.name || "(untitled)"}`,
    "",
    `**Status:** Completed · [Open in Asana](${permalink})`,
    "",
    "> Completed task — only the title and link are mirrored locally to keep syncs lean.",
    `> Pull full detail on demand: \`node \${CLAUDE_PLUGIN_ROOT}/skills/asana/scripts/asana.mjs --ticket ${task.gid}\``,
    "",
  ];
  return headerLines.join("\n") + lines.join("\n");
}

// Write (or move/update) the file for a gid, given a precomputed `existing`
// record so the caller controls how content was built. Returns the action and
// the final target path. Honors dry-run by reporting without mutating.
function applyWrite(existing, targetDir, gid, content, dryRun) {
  assertGid(gid);
  const targetPath = path.join(targetDir, `${gid}.md`);
  assertOwned(targetPath, gid);

  if (dryRun) {
    if (!existing) return { action: "would-create", targetPath };
    if (existing.path !== targetPath) return { action: "would-move", targetPath };
    if (readFileSync(existing.path, "utf8") !== content) return { action: "would-update", targetPath };
    return { action: "unchanged", targetPath };
  }

  let action = "unchanged";
  if (existing && existing.path !== targetPath) {
    action = "moved";
  } else if (!existing) {
    action = "created";
  } else if (readFileSync(existing.path, "utf8") !== content) {
    action = "updated";
  }
  if (action !== "unchanged") {
    atomicWrite(targetPath, content);
    if (action === "moved") unlinkSync(existing.path);
  }
  rememberGenerated(targetPath);
  return { action, targetPath };
}

// Open task (or explicit single-ticket request): fetch everything and write a
// full file into open/ (or closed/ when it is a completed task pulled by gid).
async function processFullTask(token, gid, args) {
  const task = await fetchTask(token, gid);
  const [stories, subtasks, attachments] = await Promise.all([
    fetchStories(token, gid),
    task.num_subtasks > 0 || args.subtaskNotes ? fetchSubtasks(token, gid, args.subtaskNotes) : Promise.resolve([]),
    fetchAttachments(token, gid),
  ]);
  const existing = findExistingFile(gid);
  task._preservedProcessed = existing ? readPreservedProcessed(existing.path) : false;
  const content = renderMarkdown(task, stories, subtasks, attachments);
  const targetDir = task.completed ? CLOSED_DIR : OPEN_DIR;
  const result = applyWrite(existing, targetDir, gid, content, args.dryRun);
  if (args.attachments) await downloadAttachments(token, gid, attachments, args.dryRun);
  return result;
}

// Completed task in a full sync: stub it from the list record, no API calls.
function processStubTask(task, projectGid, dryRun) {
  const existing = findExistingFile(task.gid);
  task._preservedProcessed = existing ? readPreservedProcessed(existing.path) : true;
  const content = renderStub(task, projectGid);
  return applyWrite(existing, CLOSED_DIR, task.gid, content, dryRun);
}

function summarize(results) {
  return results.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`Asana skill (Node 22+)\n\nRead:\n  --ticket <gid>              Full task, including comments and attachment links\n  --subtask-notes             Include direct subtask descriptions and assignees\n  --attachments              Download task attachments (maximum 100 MiB each)\n  --story <gid>               Save one exact story; --comment-id is an alias\n  --whoami                    Show the account used by this token\n  no mode                     Sync configured project; completed tasks are stubs\n\nWrite (only when requested):\n  --complete --ticket <gid>   Complete one task and verify saved state\n  --comment --ticket <gid> --text-file <path>\n  --comment --ticket <gid> --text <text>\n  --mention <user-gid>        Add a real mention; repeat for multiple people\n  --notify                    Add missing mentioned followers before posting\n\nCommon:\n  --dry-run                   Read and preview only; no local or remote writes\n  --help                      Show help without credentials\n\nConfig: .refact-os.json asana.projectId and optional project-relative asana.taskDir.\nAliases: --subtasks, --comment-id, -t, -c.\n`);
    return;
  }
  const env = { ...loadDotEnv(ENV_PATH), ...process.env };
  const config = loadConfig();
  configurePaths(config);
  const projectId = config.asana?.projectId;
  if (!args.ticket && !args.story && !args.whoami) assertGid(projectId, "asana.projectId");

  const { token, source, error } = resolveToken(env, config);
  if (!token) {
    die(
      `ASANA_TOKEN could not be sourced — ${error || "it is not set."}\n` +
        "  Set it as the ASANA_TOKEN field of the shared 1Password item, or run " +
        "the sync-env-vars skill to set up op access (https://app.asana.com/0/my-apps).",
    );
  }
  if (source && source !== "env") {
    process.stdout.write(`Resolved ASANA_TOKEN from ${source}.\n`);
  }

  if (args.whoami) {
    const user = (await asanaFetch(token, "/users/me", { opt_fields: "name" })).data;
    process.stdout.write(`Asana account: ${user.name} (gid: ${user.gid})\n`);
    return;
  }
  if (args.comment) return writeComment(token, args);
  if (args.complete) return completeTask(token, args);
  if (args.story) return readSingleStory(token, args);

  const results = [];

  if (args.ticket) {
    // Explicit single-ticket request: always pull full detail, even if it is a
    // completed task. A later full sync re-slims a completed task to a stub.
    try {
      const { action, targetPath } = await processFullTask(token, args.ticket, args);
      results.push({ gid: args.ticket, action, path: targetPath });
      process.stdout.write(`  ${action.padEnd(13)} ${path.relative(PROJECT_ROOT, targetPath)}\n`);
    } catch (err) {
      results.push({ gid: args.ticket, action: "error", error: err.message });
      process.stderr.write(`  error ${args.ticket}: ${err.message}\n`);
    }
  } else {
    process.stdout.write(`Fetching task list for Asana project ${projectId}…\n`);
    const tasks = await fetchProjectTasks(token, projectId);
    const openTasks = tasks.filter((t) => !t.completed).length;
    process.stdout.write(
      `  found ${tasks.length} task(s): ${openTasks} open (full), ${tasks.length - openTasks} completed (stub).\n`,
    );
    for (const task of tasks) {
      try {
        const { action, targetPath } = task.completed
          ? processStubTask(task, projectId, args.dryRun)
          : await processFullTask(token, task.gid, args);
        results.push({ gid: task.gid, action, path: targetPath });
        process.stdout.write(`  ${action.padEnd(13)} ${path.relative(PROJECT_ROOT, targetPath)}\n`);
      } catch (err) {
        results.push({ gid: task.gid, action: "error", error: err.message });
        process.stderr.write(`  error ${task.gid}: ${err.message}\n`);
      }
    }
  }

  const counts = summarize(results);
  process.stdout.write(`\nDone. ${JSON.stringify(counts)}\n`);
  if (counts.error) process.exitCode = 1;
}

main().finally(flushGitignore).catch((err) => {
  process.stderr.write(`asana: ${err.message || err}\n`);
  process.exit(1);
});
