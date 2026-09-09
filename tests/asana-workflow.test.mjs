import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'plugins/base/skills/asana/scripts/asana.mjs');
const fetchGuard = pathToFileURL(join(root, 'tests/fixtures/asana/local-fetch-only.mjs')).href;
const token = 'synthetic-asana-workflow-token';
const bytes = Buffer.from([0, 255, 128, 10, 13, 34, 60, 62, 65, 0, 66]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const person = (gid, name) => ({ gid, name, resource_type: 'user', email: `${gid}@example.test` });
const users = {
  600: person('600', 'Project Bot'),
  601: person('601', 'Ana Owner'),
  602: person('602', 'Jordan Reviewer'),
  603: person('603', 'Existing Follower'),
};

function task(gid, name, extra = {}) {
  return {
    gid, name, resource_type: 'task', resource_subtype: 'default_task',
    notes: `Instructions for ${gid}.`, completed: false, completed_at: null,
    created_at: '2026-09-01T09:00:00.000Z', modified_at: '2026-09-08T10:00:00.000Z',
    assignee: users[601], followers: [users[603]], due_on: '2026-09-12', due_at: null,
    permalink_url: `https://app.asana.com/0/900/${gid}`,
    projects: [{ gid: '900', name: 'Website delivery', resource_type: 'project' }],
    memberships: [{ project: { gid: '900', name: 'Website delivery' }, section: { gid: '901', name: 'In progress' } }],
    tags: [{ gid: '910', name: 'Client request' }],
    custom_fields: [{ gid: '920', name: 'Priority', resource_subtype: 'enum', display_value: 'High', enum_value: { gid: '921', name: 'High' } }],
    parent: null, ...extra,
  };
}

function story(gid, taskGid, text, extra = {}) {
  return {
    gid, resource_type: 'story', resource_subtype: 'comment_added', type: 'comment',
    created_at: `2026-09-08T10:${String(Number(gid) % 60).padStart(2, '0')}:00.000Z`,
    created_by: users[601], target: { gid: taskGid, resource_type: 'task' },
    text, html_text: `<body>${text}</body>`, is_edited: false, ...extra,
  };
}

function projectFields(value, fields) {
  if (!fields || value === null || typeof value !== 'object') return clone(value);
  if (Array.isArray(value)) return value.map((item) => projectFields(item, fields));
  const result = {};
  for (const name of ['gid', 'resource_type']) if (name in value) result[name] = value[name];
  for (const field of fields) {
    const [key, ...rest] = field.split('.');
    if (!(key in value)) continue;
    if (rest.length === 0) result[key] = clone(value[key]);
    else {
      const subfields = fields.filter((entry) => entry.startsWith(`${key}.`)).map((entry) => entry.slice(key.length + 1));
      if (!fields.includes(key)) result[key] = projectFields(value[key], subfields);
    }
  }
  return result;
}

function plainText(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

function allFiles(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = join(prefix, entry.name);
    return entry.isDirectory() ? allFiles(join(directory, entry.name), name) : [name];
  }).sort();
}

function fileState(directory) {
  return Object.fromEntries(allFiles(directory).filter((name) => !name.startsWith('.git/'))
    .map((name) => [name, fs.readFileSync(join(directory, name)).toString('base64')]));
}

async function fixture(t, options = {}) {
  const cwd = fs.mkdtempSync(join(tmpdir(), 'refact asana workflow '));
  const cache = options.taskDir ?? 'docs/task';
  fs.writeFileSync(join(cwd, '.refact-os.json'), JSON.stringify({ asana: { projectId: '900', taskDir: cache } }));
  const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  delete gitEnv.GIT_DIR; delete gitEnv.GIT_WORK_TREE;
  const git = (...args) => execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'fixture');
  git('config', 'user.name', 'Mina Example');
  git('config', 'user.email', 'mina@example.test');
  const state = {
    tasks: {
      101: task('101', 'Review the new checkout', { notes: 'Keep the order summary visible.\nCheck narrow screens and keyboard focus.' }),
      102: task('102', 'Old footer request', { completed: true, completed_at: '2026-09-03T11:00:00.000Z', notes: 'Completed task private history.' }),
      103: task('103', 'Check tablet layout', { notes: 'Check landscape mode before release.' }),
      104: task('104', 'Test the narrow layout', { notes: 'At 375 px, keep the submit button visible.\nDo not hide the price.', assignee: users[602], due_on: '2026-09-10', parent: { gid: '101', name: 'Review the new checkout' } }),
      105: task('105', 'Nested child', { notes: 'Grandchild instructions.', parent: { gid: '104', name: 'Test the narrow layout' } }),
    },
    stories: {
      501: story('501', '101', 'First review: the narrow screen has a gap.'),
      502: story('502', '101', 'Requested exact comment: keep the price on the right.'),
      503: story('503', '101', 'Later comment: please add a screenshot.'),
      504: story('504', '101', 'Ana changed the due date.', { type: 'system', resource_subtype: 'due_date_changed' }),
      505: story('505', '102', 'This completed task needs no further changes.'),
      506: story('506', '103', 'The tablet check is still open.'),
      507: story('507', '104', 'Child discussion that requires a separate pull.'),
    },
    attachments: {
      701: { gid: '701', resource_type: 'attachment', resource_subtype: 'asana', name: 'layout proof.bin', host: 'asana', parent: { gid: '101' }, permanent_url: 'https://app.asana.com/app/asana/-/get_asset?asset_id=701' },
    },
    children: { 101: ['104'], 104: ['105'] },
    projectTaskIds: ['101', '102', '103'],
    taskAttachmentIds: { 101: ['701'] },
    requests: [], unexpected: [], failures: new Map(),
    loseNextCommentResponse: false, loseNextCompletionResponse: false,
    ignoreCompletion: false, stripSavedMentions: false, dropAddedFollowers: false,
    followerDelayReads: 0, pendingFollowers: [], nextStory: 800,
  };
  for (const item of Object.values(state.tasks)) item.num_subtasks = (state.children[item.gid] || []).length;
  let origin;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const body = rawBody ? JSON.parse(rawBody) : undefined;
      const call = { method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, headers: { ...request.headers } };
      state.requests.push(call);
      const send = (status, payload, headers = {}) => {
        response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        response.end(JSON.stringify(payload));
      };
      const fail = (status, message) => send(status, { errors: [{ message }] });
      const fields = url.searchParams.get('opt_fields')?.split(',');
      const sendOne = (value) => send(200, { data: projectFields(value, fields) });
      const sendPage = (values, size = 2) => {
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!Number.isInteger(offset) || offset < 0) return fail(400, 'Invalid offset');
        const next = offset + size < values.length ? String(offset + size) : null;
        const nextUrl = new URL(url);
        if (next) nextUrl.searchParams.set('offset', next);
        send(200, { data: values.slice(offset, offset + size).map((item) => projectFields(item, fields)),
          next_page: next ? { offset: next, path: `${nextUrl.pathname}${nextUrl.search}`, uri: nextUrl.href } : null });
      };
      if (url.pathname.startsWith('/download/')) {
        const gid = url.pathname.split('/').at(-1);
        response.writeHead(302, { Location: `/bytes/${gid}` }); response.end(); return;
      }
      if (url.pathname.startsWith('/bytes/')) {
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': options.largeAttachment ? String(101 * 1024 * 1024) : String(bytes.length) });
        response.end(bytes); return;
      }
      if (!url.pathname.startsWith('/api/1.0/')) { state.unexpected.push(call); return fail(404, 'Unknown API path'); }
      if (request.headers.authorization !== `Bearer ${token}`) return fail(401, 'Missing fixture credentials');
      const path = url.pathname.slice('/api/1.0'.length);
      const failure = state.failures.get(`${request.method} ${path}`);
      if (failure && failure.remaining !== 0 && (!failure.offset || url.searchParams.get('offset') === failure.offset)) {
        if (failure.remaining !== undefined) failure.remaining--;
        return send(failure.status, { errors: [{ message: failure.message || 'Fixture error' }] }, failure.headers);
      }
      let match;
      if (request.method === 'GET' && (match = path.match(/^\/users\/(me|\d+)$/))) {
        const user = users[match[1] === 'me' ? '600' : match[1]];
        return user ? sendOne(user) : fail(404, 'Unknown user');
      }
      if (request.method === 'GET' && path === '/projects/900') return sendOne({ gid: '900', resource_type: 'project', name: 'Website delivery' });
      if (request.method === 'GET' && path === '/projects/900/tasks') return sendPage(state.projectTaskIds.map((gid) => state.tasks[gid]));
      if (request.method === 'GET' && path === '/tasks' && url.searchParams.get('project') === '900') return sendPage(state.projectTaskIds.map((gid) => state.tasks[gid]));
      if (request.method === 'GET' && (match = path.match(/^\/tasks\/(\d+)$/))) {
        const item = state.tasks[match[1]];
        if (!item) return fail(404, 'Unknown task');
        const pending = state.pendingFollowers.filter((entry) => entry.taskGid === item.gid);
        if (pending.length && state.followerDelayReads-- <= 0) {
          item.followers.push(...pending.flatMap((entry) => entry.gids.map((gid) => users[gid])));
          state.pendingFollowers = state.pendingFollowers.filter((entry) => entry.taskGid !== item.gid);
        }
        return sendOne(item);
      }
      if (request.method === 'GET' && (match = path.match(/^\/tasks\/(\d+)\/subtasks$/))) return sendPage((state.children[match[1]] || []).map((gid) => state.tasks[gid]));
      if (request.method === 'GET' && (match = path.match(/^\/tasks\/(\d+)\/stories$/))) return sendPage(Object.values(state.stories).filter((item) => item.target.gid === match[1]));
      if (request.method === 'GET' && (match = path.match(/^\/stories\/(\d+)$/))) return state.stories[match[1]] ? sendOne(state.stories[match[1]]) : fail(404, 'Unknown story');
      if (request.method === 'GET' && (match = path.match(/^\/tasks\/(\d+)\/attachments$/))) return sendPage((state.taskAttachmentIds[match[1]] || []).map((gid) => state.attachments[gid]));
      if (request.method === 'GET' && path === '/attachments') return sendPage((state.taskAttachmentIds[url.searchParams.get('parent')] || []).map((gid) => state.attachments[gid]));
      if (request.method === 'GET' && (match = path.match(/^\/attachments\/(\d+)$/))) {
        const item = state.attachments[match[1]];
        return item ? sendOne({ ...item, download_url: item.resource_subtype === 'asana' ? `${origin}/download/${item.gid}` : null }) : fail(404, 'Unknown attachment');
      }
      if (request.method === 'PUT' && (match = path.match(/^\/tasks\/(\d+)$/))) {
        const item = state.tasks[match[1]];
        if (!item) return fail(404, 'Unknown task');
        if (!state.ignoreCompletion) Object.assign(item, clone(body.data));
        if (state.loseNextCompletionResponse) { state.loseNextCompletionResponse = false; request.socket.destroy(); return; }
        return sendOne(item);
      }
      if (request.method === 'POST' && (match = path.match(/^\/tasks\/(\d+)\/addFollowers$/))) {
        const item = state.tasks[match[1]];
        if (!item) return fail(404, 'Unknown task');
        const gids = body.data.followers;
        if (!Array.isArray(gids) || gids.some((gid) => !users[gid])) return fail(400, 'Followers must be known user GIDs');
        if (!state.dropAddedFollowers) {
          if (state.followerDelayReads > 0) state.pendingFollowers.push({ taskGid: item.gid, gids });
          else item.followers.push(...gids.filter((gid) => !item.followers.some((user) => user.gid === gid)).map((gid) => users[gid]));
        }
        return sendOne(item);
      }
      if (request.method === 'POST' && (match = path.match(/^\/tasks\/(\d+)\/stories$/))) {
        if (!state.tasks[match[1]]) return fail(404, 'Unknown task');
        if (!body?.data || !['text', 'html_text'].some((field) => typeof body.data[field] === 'string')) return fail(400, 'Story content is required');
        if (Object.keys(body.data).some((key) => !['text', 'html_text', 'is_pinned', 'resource_subtype'].includes(key))) return fail(400, 'Unexpected story field');
        const html = body.data.html_text;
        if (html && !/^<body>[\s\S]*<\/body>$/.test(html)) return fail(400, 'Rich text needs a body element');
        const gid = String(state.nextStory++);
        const saved = story(gid, match[1], body.data.text ?? plainText(html), { created_by: users[600], html_text: html ?? `<body>${body.data.text}</body>` });
        if (state.stripSavedMentions) saved.html_text = saved.html_text.replace(/<a\b[^>]*data-asana-gid[^>]*\/>/g, '').replace(/<a\b[^>]*data-asana-gid[^>]*>[^<]*<\/a>/g, '');
        state.stories[gid] = saved;
        if (state.loseNextCommentResponse) { state.loseNextCommentResponse = false; request.socket.destroy(); return; }
        return send(201, { data: clone(saved) });
      }
      state.unexpected.push(call); fail(404, 'Unsupported fixture request');
    } catch (error) {
      state.unexpected.push({ error: error.stack });
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ errors: [{ message: error.message }] }));
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  const run = (args = [], extraEnv = {}) => new Promise((done, reject) => {
    const child = spawn(process.execPath, ['--import', fetchGuard, script, ...args], {
      cwd, env: { ...gitEnv, ASANA_TOKEN: token, ASANA_API_BASE: `${origin}/api/1.0`, NODE_OPTIONS: '', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; }); child.stderr.on('data', (data) => { stderr += data; });
    const timeout = setTimeout(() => { child.kill('SIGKILL'); }, 25000);
    child.on('error', reject);
    child.on('close', (code, signal) => { clearTimeout(timeout); done({ code, signal, stdout, stderr }); });
  });
  const write = (name, contents) => { fs.mkdirSync(dirname(join(cwd, name)), { recursive: true }); fs.writeFileSync(join(cwd, name), contents); };
  const read = (name) => fs.readFileSync(join(cwd, name), 'utf8');
  const cacheFiles = () => allFiles(join(cwd, cache));
  const snapshots = () => cacheFiles().filter((name) => name.endsWith('.md')).map((name) => ({ name, text: fs.readFileSync(join(cwd, cache, name), 'utf8') }));
  const snapshot = (gid) => {
    const found = snapshots().filter((file) => file.name.split(/[^0-9]+/).includes(gid));
    assert.equal(found.length, 1, `Expected one snapshot for ${gid}; got ${JSON.stringify(snapshots())}`);
    return found[0];
  };
  return { cwd, cache, state, run, git, write, read, cacheFiles, snapshots, snapshot, origin };
}

const writes = (f) => f.state.requests.filter((call) => !['GET', 'HEAD'].includes(call.method));
const callsTo = (f, path, method = 'GET') => f.state.requests.filter((call) => call.method === method && call.path === `/api/1.0${path}`);
const success = (result) => assert.equal(result.code, 0, JSON.stringify(result));
const failed = (result) => {
  assert.notEqual(result.code, 0, JSON.stringify(result));
  assert.equal(result.signal, null, JSON.stringify(result));
  assert.ok(!(result.stdout + result.stderr).includes('Workflow fixture blocked non-local fetch'), JSON.stringify(result));
};
const noSecrets = (f, result) => {
  assert.ok(!(result.stdout + result.stderr).includes(token), 'CLI output exposed the token');
  for (const name of allFiles(f.cwd).filter((name) => !name.startsWith('.git/'))) assert.ok(!fs.readFileSync(join(f.cwd, name), 'utf8').includes(token), `Token saved in ${name}`);
};

test('project sync saves complete open tasks and paginated comments, with inexpensive completed stubs', async (t) => {
  const f = await fixture(t, { taskDir: 'notes/asana cache' });
  const result = await f.run(); success(result);
  const open = f.snapshot('101').text, completed = f.snapshot('102').text;
  for (const expected of ['Review the new checkout', 'Keep the order summary visible.', 'Check narrow screens and keyboard focus.', 'Test the narrow layout', 'layout proof.bin', 'Priority', 'High']) assert.ok(open.includes(expected), `Missing ${expected}: ${open}`);
  for (const gid of ['501', '502', '503']) {
    assert.ok(open.includes(f.state.stories[gid].text), `Missing comment ${gid}`);
    assert.ok(open.includes(gid), `Missing stable comment GID ${gid}`);
  }
  assert.ok(completed.includes('Old footer request'));
  assert.ok(completed.includes(f.state.tasks[102].permalink_url));
  assert.ok(!completed.includes(f.state.tasks[102].notes));
  assert.equal(callsTo(f, '/tasks/102').length, 0);
  assert.equal(callsTo(f, '/tasks/102/stories').length, 0);
  assert.ok(f.snapshot('103').text.includes('Check landscape mode before release.'));
  assert.ok(callsTo(f, '/tasks/101/stories').some((call) => call.query.offset));
  assert.equal(writes(f).length, 0); assert.deepEqual(f.state.unexpected, []);
  noSecrets(f, result);
});

test('a single completed task is read in full when its history is requested', async (t) => {
  const f = await fixture(t);
  const result = await f.run(['--ticket', '102']); success(result);
  const saved = f.snapshot('102').text;
  assert.ok(saved.includes('Completed task private history.'));
  assert.ok(saved.includes(f.state.stories[505].text));
  assert.ok(saved.includes('505'));
  assert.equal(writes(f).length, 0);
});

test('direct child instructions include assignee and due date without reading grandchildren or child discussions', async (t) => {
  const f = await fixture(t);
  const result = await f.run(['--ticket', '101', '--subtask-notes']); success(result);
  const saved = f.snapshot('101').text;
  for (const value of [...f.state.tasks[104].notes.split('\n'), 'Jordan Reviewer', '2026-09-10']) assert.ok(saved.includes(value), `Missing child detail ${value}: ${saved}`);
  assert.equal(callsTo(f, '/tasks/104/stories').length, 0);
  assert.equal(callsTo(f, '/tasks/104/subtasks').length, 0);
  assert.equal(callsTo(f, '/tasks/105').length, 0);
  assert.equal(writes(f).length, 0);
});

test('an exact comment ID returns that comment and verifies the requested parent task', async (t) => {
  const f = await fixture(t);
  const result = await f.run(['--comment-id', '502', '--ticket', '101']); success(result);
  const saved = f.snapshots().map((item) => item.text).join('\n');
  assert.ok(saved.includes(f.state.stories[502].text));
  assert.ok(saved.includes('502') && saved.includes('101'));
  assert.ok(!saved.includes(f.state.stories[503].text));
  assert.equal(callsTo(f, '/stories/502').length, 1);
  assert.equal(callsTo(f, '/tasks/101/stories').length, 0);
  assert.equal(writes(f).length, 0);
  const before = fileState(f.cwd);
  const wrong = await f.run(['--story', '502', '--ticket', '103']); failed(wrong);
  assert.deepEqual(fileState(f.cwd), before, 'A parent mismatch must not save a misleading comment snapshot');
});

test('attachment download preserves bytes, obtains a fresh link, and never sends the API token to the download host', async (t) => {
  const f = await fixture(t);
  f.state.attachments[701].name = '../../outside proof.bin';
  const result = await f.run(['--ticket', '101', '--attachments']); success(result);
  const saved = f.cacheFiles().filter((name) => fs.readFileSync(join(f.cwd, f.cache, name)).equals(bytes));
  assert.equal(saved.length, 1, `Downloaded bytes missing from ${f.cacheFiles()}`);
  assert.ok(!relative(join(f.cwd, f.cache), resolve(f.cwd, f.cache, saved[0])).startsWith('..'));
  assert.deepEqual(allFiles(f.cwd).filter((name) => fs.readFileSync(join(f.cwd, name)).equals(bytes)), [join(f.cache, saved[0])]);
  assert.equal(callsTo(f, '/attachments/701').length, 1);
  const downloads = f.state.requests.filter((call) => /^\/(download|bytes)\//.test(call.path));
  assert.equal(downloads.length, 2);
  assert.ok(downloads.every((call) => !call.headers.authorization), 'The API token must not be sent during attachment downloads');
  assert.equal(writes(f).length, 0); noSecrets(f, result);
});

test('all read and write previews leave the project and remote state unchanged', async (t) => {
  const f = await fixture(t);
  f.write('update text.txt', 'First line.\n\nSecond line: <tag> & value.\n');
  f.write('docs/task/README.md', 'Notes written by a person.\n');
  const before = fileState(f.cwd), remote = clone({ tasks: f.state.tasks, stories: f.state.stories });
  for (const args of [[], ['--ticket', '101', '--subtask-notes', '--attachments'], ['--story', '502', '--ticket', '101'], ['--complete', '--ticket', '101'], ['--comment', '--ticket', '101', '--text-file', 'update text.txt', '--mention', '602', '--notify']]) {
    const result = await f.run([...args, '--dry-run']); success(result);
    assert.deepEqual(fileState(f.cwd), before, `Preview changed files for ${args}`);
    assert.equal(writes(f).length, 0, `Preview wrote remotely for ${args}`);
    assert.deepEqual({ tasks: f.state.tasks, stories: f.state.stories }, remote);
    noSecrets(f, result);
  }
});

test('the bot posts an attributed multiline update and adds only the requested recipient before mentioning them', async (t) => {
  const f = await fixture(t);
  const identity = await f.run(['--whoami']); success(identity);
  assert.ok(identity.stdout.includes('Project Bot') && identity.stdout.includes('600'));
  assert.equal(f.cacheFiles().length, 0);
  const message = 'Ready for review.\n\n- Check <header> & "body".\n- Keep literal $(no-command) and `no-command`.\n';
  f.write('review update.txt', message);
  const result = await f.run(['--comment', '--ticket', '101', '--text-file', 'review update.txt', '--mention', '602', '--notify']); success(result);
  const posts = callsTo(f, '/tasks/101/stories', 'POST');
  assert.equal(posts.length, 1);
  assert.deepEqual(Object.keys(posts[0].body.data), ['html_text']);
  const html = posts[0].body.data.html_text;
  assert.ok(plainText(html).includes(message.trimEnd()), `Multiline input changed: ${html}`);
  assert.equal(plainText(html).split('Mina Example').length - 1, 1);
  assert.ok(/<a\b[^>]*data-asana-gid=["']602["']/.test(html), `A real recipient mention is missing: ${html}`);
  assert.ok(!html.includes('<header>'), 'User text must be escaped, not interpreted as HTML');
  assert.deepEqual(callsTo(f, '/tasks/101/addFollowers', 'POST').map((call) => call.body), [{ data: { followers: ['602'] } }]);
  assert.ok(f.state.requests.indexOf(callsTo(f, '/tasks/101/addFollowers', 'POST')[0]) < f.state.requests.indexOf(posts[0]));
  assert.deepEqual(f.state.tasks[101].followers.map((user) => user.gid).sort(), ['602', '603']);
  assert.equal(f.state.tasks[101].assignee.gid, '601');
  assert.equal(writes(f).length, 2);
  const saved = f.state.stories[800];
  assert.equal(saved.created_by.gid, '600');
  assert.ok(saved.text.includes(message.trimEnd()) && saved.text.includes('Mina Example'));
  assert.ok(callsTo(f, '/stories/800').length >= 1, 'The saved story must be read back');
  noSecrets(f, result);
});

test('an assignee or existing follower can be notified without changing task membership', async (t) => {
  const f = await fixture(t);
  const followers = clone(f.state.tasks[101].followers), assignee = clone(f.state.tasks[101].assignee);
  const result = await f.run(['--comment', '--ticket', '101', '--text', 'Please review the finished check.', '--mention', '601', '--mention', '603', '--notify']); success(result);
  assert.equal(callsTo(f, '/tasks/101/addFollowers', 'POST').length, 0);
  assert.deepEqual(f.state.tasks[101].followers, followers);
  assert.deepEqual(f.state.tasks[101].assignee, assignee);
  const html = callsTo(f, '/tasks/101/stories', 'POST')[0].body.data.html_text;
  for (const gid of ['601', '603']) assert.ok(html.includes(`data-asana-gid="${gid}"`));
  assert.equal(writes(f).length, 1);
});

test('notification waits for follower membership to become visible before posting', async (t) => {
  const f = await fixture(t); f.state.followerDelayReads = 1;
  const result = await f.run(['--comment', '--ticket', '101', '--text', 'Please review the narrow layout.', '--mention', '602', '--notify']); success(result);
  assert.equal(callsTo(f, '/tasks/101/addFollowers', 'POST').length, 1);
  assert.equal(callsTo(f, '/tasks/101/stories', 'POST').length, 1);
  assert.ok(f.state.tasks[101].followers.some((user) => user.gid === '602'));
  const addIndex = f.state.requests.indexOf(callsTo(f, '/tasks/101/addFollowers', 'POST')[0]);
  const postIndex = f.state.requests.indexOf(callsTo(f, '/tasks/101/stories', 'POST')[0]);
  assert.ok(f.state.requests.slice(addIndex + 1, postIndex).filter((call) => call.method === 'GET' && call.path === '/api/1.0/tasks/101').length >= 2);
});

test('notification does not post if the requested follower was never saved', async (t) => {
  const f = await fixture(t); f.state.dropAddedFollowers = true;
  const result = await f.run(['--comment', '--ticket', '101', '--text', 'Please review.', '--mention', '602', '--notify']); failed(result);
  assert.equal(callsTo(f, '/tasks/101/addFollowers', 'POST').length, 1);
  assert.equal(callsTo(f, '/tasks/101/stories', 'POST').length, 0);
  assert.equal(f.state.tasks[101].assignee.gid, '601');
  assert.ok(!f.state.tasks[101].followers.some((user) => user.gid === '602'));
});

test('a recipient without access cannot cause a partial notification or comment write', async (t) => {
  const f = await fixture(t);
  const result = await f.run(['--comment', '--ticket', '101', '--text', 'Ready to review.', '--mention', '999', '--notify']); failed(result);
  assert.equal(writes(f).length, 0);
  assert.equal(Object.keys(f.state.stories).length, 7);
});

test('missing author attribution stops a comment before any write', async (t) => {
  const f = await fixture(t); f.git('config', '--unset', 'user.name');
  const result = await f.run(['--comment', '--ticket', '101', '--text', 'Please review this update.']); failed(result);
  assert.equal(writes(f).length, 0);
  assert.equal(Object.keys(f.state.stories).length, 7);
});

test('completion updates only the named task and is safe to rerun after it is complete', async (t) => {
  const f = await fixture(t);
  const before = clone(f.state.tasks);
  const result = await f.run(['--complete', '--ticket', '101']); success(result);
  assert.deepEqual(callsTo(f, '/tasks/101', 'PUT').map((call) => call.body), [{ data: { completed: true } }]);
  assert.equal(f.state.tasks[101].completed, true);
  const expected = clone(before); expected[101].completed = true;
  assert.deepEqual(f.state.tasks, expected);
  const putIndex = f.state.requests.indexOf(callsTo(f, '/tasks/101', 'PUT')[0]);
  assert.ok(f.state.requests.slice(putIndex + 1).some((call) => call.path === '/api/1.0/tasks/101' && call.method === 'GET'), 'Completion must be read back');
  const again = await f.run(['--complete', '--ticket', '101']); success(again);
  assert.equal(callsTo(f, '/tasks/101', 'PUT').length, 1, 'An already completed task needs no second write');
  assert.deepEqual(f.state.tasks, expected);
  assert.equal(writes(f).length, 1);
});

test('a lost completion response is checked before rerunning and does not create a second write', async (t) => {
  const f = await fixture(t);
  f.state.loseNextCompletionResponse = true;
  const result = await f.run(['--complete', '--ticket', '101']);
  assert.equal(result.signal, null, JSON.stringify(result));
  assert.equal(f.state.tasks[101].completed, true);
  assert.equal(callsTo(f, '/tasks/101', 'PUT').length, 1);
  if (result.code === 0) {
    const putIndex = f.state.requests.indexOf(callsTo(f, '/tasks/101', 'PUT')[0]);
    assert.ok(f.state.requests.slice(putIndex + 1).some((call) => call.path === '/api/1.0/tasks/101' && call.method === 'GET'), 'Success after a lost response requires reading saved state');
  }
  success(await f.run(['--ticket', '101']));
  assert.ok(f.snapshot('101').text.includes('asana-completed: true'));
  success(await f.run(['--complete', '--ticket', '101']));
  assert.equal(callsTo(f, '/tasks/101', 'PUT').length, 1);
  assert.equal(writes(f).length, 1);
});

test('a successful HTTP response without saved completion is reported as incomplete', async (t) => {
  const f = await fixture(t); f.state.ignoreCompletion = true;
  const result = await f.run(['--complete', '--ticket', '101']); failed(result);
  assert.equal(f.state.tasks[101].completed, false);
  assert.equal(callsTo(f, '/tasks/101', 'PUT').length, 1);
});

test('after a lost comment response, a full task read finds the saved update without posting it again', async (t) => {
  const f = await fixture(t); f.state.loseNextCommentResponse = true;
  const message = 'Release is ready.\nThe narrow screen is checked.';
  f.write('update.txt', message);
  const result = await f.run(['--comment', '--ticket', '101', '--text-file', 'update.txt']); failed(result);
  assert.equal(callsTo(f, '/tasks/101/stories', 'POST').length, 1);
  assert.ok(f.state.stories[800].text.includes(message));
  const read = await f.run(['--ticket', '101']); success(read);
  const saved = f.snapshot('101').text;
  assert.ok(saved.includes(message) && saved.includes('800') && saved.includes('Mina Example'));
  assert.equal(callsTo(f, '/tasks/101/stories', 'POST').length, 1);
  noSecrets(f, result); noSecrets(f, read);
});

test('the command fails if a requested mention was not saved by Asana', async (t) => {
  const f = await fixture(t); f.state.stripSavedMentions = true;
  const result = await f.run(['--comment', '--ticket', '101', '--text', 'Please review.', '--mention', '603']); failed(result);
  assert.equal(callsTo(f, '/tasks/101/stories', 'POST').length, 1);
  assert.ok(!f.state.stories[800].html_text.includes('data-asana-gid'));
  assert.equal(writes(f).length, 1);
});

test('a failed comment read-back does not retry the post', async (t) => {
  const f = await fixture(t);
  f.state.failures.set('GET /stories/800', { status: 403 });
  const result = await f.run(['--comment', '--ticket', '101', '--text', 'The task is ready.']); failed(result);
  assert.ok(f.state.stories[800].text.includes('The task is ready.'));
  assert.equal(callsTo(f, '/tasks/101/stories', 'POST').length, 1);
  assert.equal(writes(f).length, 1);
});

test('sync preserves human notes, tracked snapshots, processed state, and cache-local ignore rules across task status changes', async (t) => {
  const f = await fixture(t);
  f.write('.gitignore', '# Project rules\nnode_modules/\n');
  f.write('docs/task/.gitignore', '# Team notes\nprivate-note.txt\n');
  f.write('docs/task/README.md', 'Team notes written by a person.\n');
  f.write('docs/task/open/plan.md', 'Please keep this work plan.\n');
  success(await f.run());
  const original = f.snapshot('101');
  f.write(join(f.cache, original.name), original.text.replace('processed: false', 'processed: true'));
  f.git('add', '-f', '--', join(f.cache, original.name));
  const tracked = f.git('ls-files');
  success(await f.run(['--ticket', '101']));
  assert.ok(f.snapshot('101').text.includes('processed: true'));
  assert.equal(f.git('ls-files'), tracked, 'Sync must not remove files from the Git index');
  f.state.tasks[101].completed = true;
  success(await f.run());
  const closed = f.snapshot('101');
  assert.notEqual(closed.name, original.name);
  assert.ok(!fs.existsSync(join(f.cwd, f.cache, original.name)));
  assert.ok(closed.text.includes('processed: true'));
  assert.equal(f.git('ls-files'), tracked);
  f.state.tasks[101].completed = false;
  success(await f.run());
  assert.equal(f.snapshot('101').name, original.name);
  assert.ok(f.snapshot('101').text.includes('processed: true'));
  assert.equal(f.read('.gitignore'), '# Project rules\nnode_modules/\n');
  assert.equal(f.read('docs/task/README.md'), 'Team notes written by a person.\n');
  assert.equal(f.read('docs/task/open/plan.md'), 'Please keep this work plan.\n');
  assert.ok(f.read('docs/task/.gitignore').startsWith('# Team notes\nprivate-note.txt\n'));
  const ignored = (name) => {
    try { return f.git('check-ignore', '--no-index', '--', name).trim() === name; } catch { return false; }
  };
  assert.equal(ignored('docs/task/open/plan.md'), false);
  assert.equal(ignored('docs/task/README.md'), false);
  assert.equal(ignored(join(f.cache, f.snapshot('103').name)), true);
  assert.equal(writes(f).length, 0);
});

test('a person-written file at a snapshot path is preserved and causes a clear incomplete sync', async (t) => {
  const f = await fixture(t);
  f.write('docs/task/open/101.md', '# Handwritten task\nKeep these notes from the planning meeting.\n');
  const before = f.read('docs/task/open/101.md');
  const result = await f.run(); failed(result);
  assert.equal(f.read('docs/task/open/101.md'), before);
  assert.ok((result.stdout + result.stderr).includes('101'));
  assert.ok(f.snapshot('103').text.includes('Check tablet layout'));
  assert.equal(writes(f).length, 0);
});

test('an unprocessed task stays unprocessed after it is completed and reopened remotely', async (t) => {
  const f = await fixture(t);
  success(await f.run(['--ticket', '101']));
  assert.ok(f.snapshot('101').text.includes('processed: false'));
  f.state.tasks[101].completed = true;
  success(await f.run());
  assert.ok(f.snapshot('101').text.includes('processed: false'), 'Sync changed a person-controlled processed flag after completion');
  f.state.tasks[101].completed = false;
  success(await f.run());
  assert.ok(f.snapshot('101').text.includes('processed: false'), 'Sync changed the processed flag after reopening');
});

test('a conflicting human file in the destination is preserved along with the existing generated task', async (t) => {
  const f = await fixture(t);
  success(await f.run(['--ticket', '101']));
  const original = f.snapshot('101');
  f.write('docs/task/closed/101.md', '# Archive note\nKeep the old manual closeout notes.\n');
  f.state.tasks[101].completed = true;
  const before = fileState(f.cwd);
  const result = await f.run(['--ticket', '101']); failed(result);
  assert.deepEqual(fileState(f.cwd), before);
  assert.equal(f.read(join(f.cache, original.name)), original.text);
});

test('a later comment-page failure keeps the previous snapshot and reports an incomplete project sync', async (t) => {
  const f = await fixture(t);
  success(await f.run());
  const before = f.snapshot('101');
  f.state.tasks[101].notes = 'New task details with an unread discussion.';
  f.state.tasks[103].notes = 'Tablet mode has a new review instruction.';
  f.state.failures.set('GET /tasks/101/stories', { status: 403, offset: '2' });
  const result = await f.run(); failed(result);
  assert.equal(f.snapshot('101').text, before.text);
  assert.ok(f.snapshot('103').text.includes(f.state.tasks[103].notes));
  assert.ok((result.stdout + result.stderr).includes('101'));
  assert.equal(writes(f).length, 0); noSecrets(f, result);
});

test('external-provider attachments without direct download links are reported as incomplete', async (t) => {
  const f = await fixture(t);
  f.state.attachments[702] = { gid: '702', resource_type: 'attachment', resource_subtype: 'gdrive', name: 'Shared design brief', host: 'gdrive', parent: { gid: '101' }, permanent_url: 'https://drive.google.com/file/d/synthetic/view' };
  f.state.taskAttachmentIds[101].push('702');
  const result = await f.run(['--ticket', '101', '--attachments']); failed(result);
  assert.equal(callsTo(f, '/attachments/702').length, 1);
  assert.ok((result.stdout + result.stderr).includes('702'));
  assert.ok(f.cacheFiles().some((name) => fs.readFileSync(join(f.cwd, f.cache, name)).equals(bytes)));
  assert.equal(writes(f).length, 0); noSecrets(f, result);
});

test('an attachment over the documented limit is rejected without a saved partial file', async (t) => {
  const f = await fixture(t, { largeAttachment: true });
  const result = await f.run(['--ticket', '101', '--attachments']); failed(result);
  assert.ok((result.stdout + result.stderr).includes('701'));
  assert.ok(!f.cacheFiles().some((name) => name.endsWith('.bin') || name.includes('.tmp')));
  assert.equal(writes(f).length, 0);
});

test('invalid flags and malformed configuration fail before API calls or cache writes', async (t) => {
  const f = await fixture(t);
  const before = fileState(f.cwd);
  for (const args of [['--attachements'], ['--comment', '--ticket', '101'], ['--complete'], ['--mention', '602'], ['--notify', '--ticket', '101'], ['--complete', '--comment', '--ticket', '101', '--text', 'No ambiguous operation'], ['--ticket', '101/../../900']]) {
    const result = await f.run(args); failed(result);
    assert.equal(f.state.requests.length, 0);
    assert.deepEqual(fileState(f.cwd), before);
  }
  f.write('.refact-os.json', '{ invalid json');
  const malformed = fileState(f.cwd);
  failed(await f.run());
  assert.equal(f.state.requests.length, 0);
  assert.deepEqual(fileState(f.cwd), malformed);
});

test('401 and 403 stop cleanly without retrying or exposing credentials', async (t) => {
  const f = await fixture(t);
  for (const status of [401, 403]) {
    f.state.failures.set('GET /users/me', { status });
    const before = callsTo(f, '/users/me').length;
    const result = await f.run(['--whoami']); failed(result);
    assert.equal(callsTo(f, '/users/me').length - before, 1);
    assert.equal(writes(f).length, 0);
    assert.equal(f.cacheFiles().length, 0); noSecrets(f, result);
  }
});

test('a temporary read rate limit is retried, while persistent limits terminate in bounded time', async (t) => {
  const f = await fixture(t);
  f.state.failures.set('GET /users/me', { status: 429, remaining: 1, headers: { 'Retry-After': '0' } });
  success(await f.run(['--whoami']));
  assert.equal(callsTo(f, '/users/me').length, 2);
  f.state.failures.set('GET /users/me', { status: 429, headers: { 'Retry-After': '0' } });
  const before = callsTo(f, '/users/me').length;
  const result = await f.run(['--whoami']); failed(result);
  assert.ok(callsTo(f, '/users/me').length - before >= 2 && callsTo(f, '/users/me').length - before <= 6);
  assert.equal(writes(f).length, 0); noSecrets(f, result);
});

test('a failing 1Password lookup stops after one attempt without calling Asana', async (t) => {
  const f = await fixture(t);
  f.write('bin/op', '#!/bin/sh\nprintf "called\\n" >> op-calls.txt\nprintf "not currently signed in\\n" >&2\nexit 1\n');
  fs.chmodSync(join(f.cwd, 'bin/op'), 0o755);
  const result = await f.run(['--whoami'], { ASANA_TOKEN: '', PATH: `${join(f.cwd, 'bin')}:${process.env.PATH}` }); failed(result);
  assert.equal(f.read('op-calls.txt'), 'called\n');
  assert.equal(f.state.requests.length, 0);
  assert.equal(f.cacheFiles().length, 0);
  noSecrets(f, result);
});

test('a stalled 1Password lookup times out and leaves no pending unlock process', async (t) => {
  const f = await fixture(t);
  f.write('bin/op', '#!/bin/sh\nprintf "%s\\n" "$$" > op-process.txt\nprintf "called\\n" >> op-calls.txt\nexec sleep 60\n');
  fs.chmodSync(join(f.cwd, 'bin/op'), 0o755);
  const start = Date.now();
  const result = await f.run(['--whoami'], { ASANA_TOKEN: '', PATH: `${join(f.cwd, 'bin')}:${process.env.PATH}` }); failed(result);
  assert.ok(Date.now() - start < 24500, 'The documented 20-second unlock limit did not stop the command');
  assert.equal(f.read('op-calls.txt'), 'called\n');
  const pid = Number(f.read('op-process.txt').trim());
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'The stalled unlock process must be stopped');
  assert.equal(f.state.requests.length, 0);
  assert.equal(f.cacheFiles().length, 0);
  noSecrets(f, result);
});
