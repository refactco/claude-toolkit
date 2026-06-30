#!/usr/bin/env node
// agent/scripts/asana.mjs  (generated into .cursor/scripts/ and .claude/scripts/)
//
// Asana integration. Mirrors the configured Asana project into docs/task/ and
// can post comments back to tasks on behalf of the current git user.
//
// Read modes:
//   - OPEN tasks      -> docs/task/open/<gid>.md    full detail (notes, custom
//                        fields, subtasks, attachments, comments).
//   - COMPLETED tasks -> docs/task/closed/<gid>.md  lightweight stub: task name
//                        + Asana link only. Pull full detail on demand.
//
// Write mode (--comment):
//   Posts a comment to a task. Since the token is a shared bot token, the
//   comment text is automatically prefixed with the git user's name so
//   attribution is clear in Asana. Example: "Masoud Golchin: <text>"
//
// Only open tasks are fetched in full. Completed tasks are written as stubs
// straight from the single project task-list response, with no per-task API
// calls, so a project with a long completed history still syncs quickly.
//
// Idempotent (read mode): re-running updates files in place, moves them between
// open/ and closed/ as tasks change state, and preserves the `processed:` flag
// from any prior run on full files. Files left by the legacy docs/asana/ layout
// are migrated into docs/task/ on the next sync (moved, not duplicated).
//
// Requires:
//   - .refact-os.json -> `asana.projectId` (numeric Asana project GID)
//     (not required for --ticket or --comment)
//   - An Asana personal access token, resolved in this order:
//       1. ASANA_TOKEN in the environment / .env (if set), else
//       2. the ASANA_TOKEN field of a shared 1Password item (default title
//          "ASANA TOKEN", override via .refact-os.json `asana.tokenItem`) in
//          the "Env Variables & Secrets" vault, read on demand via the op CLI.
//     The token is never written to .env or to a project item. op access is
//     set up by the sync-env-vars skill.
//
// Usage:
//   npm run asana:sync                       # full project sync
//   npm run asana:sync:dry                   # show changes, write nothing
//   npm run asana:sync -- --ticket <gid>     # one task, always full detail
//   npm run asana:comment -- --ticket <gid> --text "message"  # post a comment

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, ".refact-os.json");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");

// Synced tasks live alongside hand-authored tickets under docs/task/.
const TASK_DIR = path.join(PROJECT_ROOT, "docs", "task");
const OPEN_DIR = path.join(TASK_DIR, "open");
const CLOSED_DIR = path.join(TASK_DIR, "closed");
// Legacy layout (pre-docs/task). Files here are migrated into docs/task/ on sync.
const LEGACY_OPEN_DIR = path.join(PROJECT_ROOT, "docs", "asana");
const LEGACY_CLOSED_DIR = path.join(LEGACY_OPEN_DIR, "closed");

// The fixed 1Password vault for env values & shared secrets, and the default
// item that carries the Asana token (override via .refact-os.json asana.tokenItem).
const OP_VAULT = "Env Variables & Secrets";
const DEFAULT_TOKEN_ITEM = "ASANA TOKEN";

const ASANA_BASE = process.env.ASANA_API_BASE || "https://app.asana.com/api/1.0";

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
  "type",
  "resource_subtype",
].join(",");
const SUBTASK_OPT_FIELDS = ["name", "gid", "completed"].join(",");
const ATTACHMENT_OPT_FIELDS = ["name", "permanent_url", "view_url", "host"].join(",");

function parseArgs(argv) {
  const args = { ticket: null, dryRun: false, comment: false, text: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--ticket" || a === "-t") {
      args.ticket = (argv[i + 1] || "").trim();
      i += 1;
    } else if (a.startsWith("--ticket=")) {
      args.ticket = a.slice("--ticket=".length).trim();
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--comment" || a === "-c") {
      args.comment = true;
    } else if (a === "--text") {
      args.text = (argv[i + 1] || "").trim();
      i += 1;
    } else if (a.startsWith("--text=")) {
      args.text = a.slice("--text=".length).trim();
    }
  }
  return args;
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf8");
  const out = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) || {};
  } catch {
    return {};
  }
}

// Read a single field from a 1Password item by label. Passing the vault and
// item as separate args (not an op:// reference) sidesteps reference-syntax
// limits — e.g. the "&" in the vault name, which op rejects in op:// URIs.
function opReadField(vault, item, field) {
  const out = execFileSync(
    "op",
    ["item", "get", item, "--vault", vault, "--fields", `label=${field}`, "--reveal", "--format", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(out);
  const fields = Array.isArray(parsed) ? parsed : [parsed];
  const match = fields.find((f) => (f?.value ?? "") !== "");
  return (match?.value ?? "").trim();
}

function opErrorHint(err, item) {
  if (err && err.code === "ENOENT") return "the 1Password CLI (op) is not installed.";
  const msg = String((err && (err.stderr || err.message)) || err);
  if (/sign ?in|signed in|authenticat|OP_SERVICE_ACCOUNT_TOKEN|no account|not currently/i.test(msg)) {
    return "1Password (op) is not authenticated.";
  }
  if (/isn'?t an item|not found|no item matched|more than one item|no object matched/i.test(msg)) {
    return `couldn't read ASANA_TOKEN from item "${item}" in "${OP_VAULT}" — check the item title (set asana.tokenItem in .refact-os.json if it differs).`;
  }
  return `op error reading "${item}": ${msg.split("\n")[0]}`;
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

async function asanaFetch(token, urlPath, params = {}) {
  const url = new URL(urlPath.startsWith("http") ? urlPath : `${ASANA_BASE}${urlPath}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  }
  let attempt = 0;
  while (true) {
    attempt += 1;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after") || 2);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Asana ${res.status} ${res.statusText} for ${url.pathname}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
}

async function asanaPost(token, urlPath, body) {
  const url = new URL(`${ASANA_BASE}${urlPath}`);
  let attempt = 0;
  while (true) {
    attempt += 1;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after") || 2);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Asana ${res.status} ${res.statusText} for ${url.pathname}: ${errBody.slice(0, 200)}`);
    }
    return res.json();
  }
}

async function postComment(token, taskGid, text) {
  const result = await asanaPost(token, `/tasks/${taskGid}/stories`, { data: { text } });
  return result.data;
}

async function* paginate(token, urlPath, params) {
  let offset;
  while (true) {
    const page = await asanaFetch(token, urlPath, { ...params, offset });
    for (const item of page.data || []) {
      yield item;
    }
    const next = page.next_page?.offset;
    if (!next) return;
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
  const detail = await asanaFetch(token, `/tasks/${gid}`, { opt_fields: TASK_OPT_FIELDS });
  return detail.data;
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

async function fetchSubtasks(token, gid) {
  const out = [];
  for await (const s of paginate(token, `/tasks/${gid}/subtasks`, {
    limit: 100,
    opt_fields: SUBTASK_OPT_FIELDS,
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
    if (existsSync(candidate)) return { path: candidate };
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
      if (s.text) {
        lines.push(s.text);
        lines.push("");
      }
    }
  }
  return headerLines.join("\n") + lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// Lightweight stub for a completed task: title + link only. `processed: true`
// because there is nothing to integrate — it is a pointer, not content.
function renderStub(task, projectGid) {
  const permalink = taskPermalink(task, projectGid);
  const headerLines = [
    "---",
    "source: asana",
    "added-by: asana.mjs",
    "processed: true",
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
    `> Pull full detail on demand: \`npm run asana:sync -- --ticket ${task.gid}\``,
    "",
  ];
  return headerLines.join("\n") + lines.join("\n");
}

// Write (or move/update) the file for a gid, given a precomputed `existing`
// record so the caller controls how content was built. Returns the action and
// the final target path. Honors dry-run by reporting without mutating.
function applyWrite(existing, targetDir, gid, content, dryRun) {
  const targetPath = path.join(targetDir, `${gid}.md`);

  if (dryRun) {
    if (!existing) return { action: "would-create", targetPath };
    if (existing.path !== targetPath) return { action: "would-move", targetPath };
    if (readFileSync(existing.path, "utf8") !== content) return { action: "would-update", targetPath };
    return { action: "unchanged", targetPath };
  }

  let action = "unchanged";
  if (existing && existing.path !== targetPath) {
    unlinkSync(existing.path);
    action = "moved";
  } else if (!existing) {
    action = "created";
  } else if (readFileSync(existing.path, "utf8") !== content) {
    action = "updated";
  }
  if (action !== "unchanged") {
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(targetPath, content, "utf8");
  }
  return { action, targetPath };
}

// Open task (or explicit single-ticket request): fetch everything and write a
// full file into open/ (or closed/ when it is a completed task pulled by gid).
async function processFullTask(token, gid, dryRun) {
  const task = await fetchTask(token, gid);
  const [stories, subtasks, attachments] = await Promise.all([
    fetchStories(token, gid),
    task.num_subtasks > 0 ? fetchSubtasks(token, gid) : Promise.resolve([]),
    fetchAttachments(token, gid),
  ]);
  const existing = findExistingFile(gid);
  task._preservedProcessed = existing ? readPreservedProcessed(existing.path) : false;
  const content = renderMarkdown(task, stories, subtasks, attachments);
  const targetDir = task.completed ? CLOSED_DIR : OPEN_DIR;
  return applyWrite(existing, targetDir, gid, content, dryRun);
}

// Completed task in a full sync: stub it from the list record, no API calls.
function processStubTask(task, projectGid, dryRun) {
  const existing = findExistingFile(task.gid);
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
  const env = { ...loadDotEnv(ENV_PATH), ...process.env };
  const config = loadConfig();
  const projectId = config.asana?.projectId;

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

  // --comment mode: post a comment to a task and exit.
  if (args.comment) {
    if (!args.ticket) die("--comment requires --ticket <gid>.");
    if (!args.text) die("--comment requires --text <message>.");
    const gitName = resolveGitUserName();
    const attributedText = gitName ? `${gitName}: ${args.text}` : args.text;
    const story = await postComment(token, args.ticket, attributedText);
    process.stdout.write(`Posted comment ${story.gid} on task ${args.ticket}.\n`);
    if (story.permalink_url) process.stdout.write(`  ${story.permalink_url}\n`);
    return;
  }

  if (!args.ticket && (projectId === undefined || projectId === null || projectId === "")) {
    die(
      "asana.projectId is missing in .refact-os.json. Run `npx refact-os-scaffold init` to fill it in, or pass --ticket <gid> to sync a single ticket.",
    );
  }

  const results = [];

  if (args.ticket) {
    // Explicit single-ticket request: always pull full detail, even if it is a
    // completed task. A later full sync re-slims a completed task to a stub.
    try {
      const { action, targetPath } = await processFullTask(token, args.ticket, args.dryRun);
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
          : await processFullTask(token, task.gid, args.dryRun);
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
}

main().catch((err) => {
  process.stderr.write(`asana: ${err.message || err}\n`);
  process.exit(1);
});
