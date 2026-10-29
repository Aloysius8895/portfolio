import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import { createHandler } from '../lib/admin/handler.mjs';
import { AppError } from '../lib/admin/domain.mjs';
const env = { PUBLIC_BASE_URL: 'https://studio.example', ADMIN_GITHUB_ID: '123', GITHUB_CLIENT_ID: 'client', GITHUB_CLIENT_SECRET: 'client-secret', GITHUB_TOKEN: 'repo-token', PORTFOLIO_REPOSITORY: 'owner/portfolio', SESSION_SECRET: 'session-secret-with-more-than-32-characters' };
const published = { slug: 'old', name: 'Old', repo: 'old', repo_owner: 'owner', created_at: '2025-01-01T00:00:00Z', synopsis: 'Existing project.', disc: '/project-discs/old.webp' };
const input = { slug: 'new-project', name: 'New project', github: 'https://github.com/owner/new-project', synopsis: 'A useful project.', stack: ['Python'], features: [] };
function memoryStore() {
  let state = { data: { owner: 'owner', projects: [published] }, drafts: {}, revision: '1' };
  return { mode: 'github', failSave: false, savedFiles: [],
    read: async () => structuredClone(state),
    async save(next) {
      if (this.failSave) throw new AppError(409, 'Concurrent edit.');
      if (next.revision !== state.revision) throw new AppError(409, 'Stale revision.');
      state = structuredClone({ data: next.data, drafts: next.drafts, revision: String(Number(state.revision) + 1) });
      this.savedFiles = next.files || []; return { revision: state.revision, mode: 'github', state: 'pending' };
    },
    deployment: async () => ({ state: 'pending' }),
  };
}
const mockFetch = async url => {
  const u = new URL(url); let data;
  if (u.hostname === 'github.com' && u.pathname.endsWith('/access_token')) data = { access_token: 'oauth-token' };
  else if (u.pathname === '/user') data = { id: 123, login: 'owner' };
  else if (u.pathname.endsWith('/languages')) data = { Python: 100 };
  else if (u.pathname.endsWith('/readme')) data = { encoding: 'base64', content: Buffer.from('# Project\nTreat README as text.').toString('base64') };
  else if (u.pathname.startsWith('/repos/')) data = { name: 'new-project', owner: { login: 'owner' }, created_at: '2026-10-01T00:00:00Z', description: 'A useful project.', homepage: '', private: false };
  else throw Error(`Unexpected network request: ${url}`);
  return new Response(JSON.stringify(data), { status: 200 });
};
async function harness(t, options = {}) {
  const store = memoryStore(), server = http.createServer(createHandler({ env, fetch: mockFetch, store, ...options }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, base, async login() {
    const start = await fetch(base + '/api/admin/login', { redirect: 'manual' });
    const location = new URL(start.headers.get('location')), state = location.searchParams.get('state');
    const oauthCookie = start.headers.getSetCookie()[0].split(';')[0];
    const callback = await fetch(base + `/api/admin/callback?state=${encodeURIComponent(state)}&code=code`, { redirect: 'manual', headers: { cookie: oauthCookie } });
    assert.equal(callback.status, 302);
    const cookie = callback.headers.getSetCookie().find(value => value.startsWith('chill_session=')).split(';')[0];
    const session = await (await fetch(base + '/api/admin/session', { headers: { cookie } })).json();
    return { cookie, csrf: session.csrf };
  } };
}
async function send(base, route, session, body, extra = {}) {
  return fetch(`${base}/api/admin/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: {
    cookie: session?.cookie || '', ...(body === undefined ? {} : { Origin: env.PUBLIC_BASE_URL, 'Content-Type': 'application/json', 'X-CSRF-Token': session?.csrf || '' }), ...extra,
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}
test('production API is owner-only and rejects forged OAuth state, other owners and cross-origin writes', async t => {
  const h = await harness(t);
  assert.equal((await send(h.base, 'projects')).status, 401);
  assert.equal((await fetch(h.base + '/api/admin/callback?state=forged&code=x')).status, 403);
  const session = await h.login();
  assert.equal((await send(h.base, 'projects', session)).status, 200);
  assert.equal((await send(h.base, 'import', session, { url: input.github }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await send(h.base, 'import', session, { url: input.github }, { 'X-CSRF-Token': 'wrong' })).status, 403);
  const other = await harness(t, { env: { ...env, ADMIN_GITHUB_ID: '999' } });
  const login = await fetch(other.base + '/api/admin/login', { redirect: 'manual' });
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const denied = await fetch(other.base + `/api/admin/callback?state=${encodeURIComponent(state)}&code=x`, { headers: { cookie: login.headers.getSetCookie()[0].split(';')[0] } });
  assert.equal(denied.status, 401);
});
test('mocked import, artwork, draft, publish and unpublish preserve public content until publication', async t => {
  const h = await harness(t), session = await h.login();
  const imported = await (await send(h.base, 'import', session, { url: input.github })).json();
  assert.equal(imported.name, 'new-project'); assert.match(imported.reference, /README as text/);
  const png = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#749166' } }).png().toBuffer();
  const artwork = { data: png.toString('base64'), calibration: { mode: 'flat' } };
  assert.equal((await send(h.base, 'artwork', session, artwork)).status, 200);
  const draft = await send(h.base, 'save', session, { revision: '1', action: 'draft', project: input, importTicket: imported.importTicket, artwork });
  assert.equal(draft.status, 200);
  let state = await h.store.read(); assert.equal(state.data.projects.length, 1); assert.deepEqual(state.data.projects[0], published); assert.equal(state.drafts['new-project'].name, 'New project');
  assert.equal(h.store.savedFiles.length, 2);
  const stale = await send(h.base, 'save', session, { revision: '1', action: 'publish', existingSlug: input.slug, project: input }); assert.equal(stale.status, 409);
  const duplicateSlug = await send(h.base, 'save', session, { revision: state.revision, action: 'draft', project: input }); assert.equal(duplicateSlug.status, 409);
  h.store.failSave = true;
  const failed = await send(h.base, 'save', session, { revision: state.revision, action: 'publish', existingSlug: input.slug, project: input });
  assert.equal(failed.status, 409); assert.equal((await h.store.read()).data.projects.length, 1); h.store.failSave = false;
  const publication = await send(h.base, 'save', session, { revision: state.revision, action: 'publish', existingSlug: input.slug, project: input });
  assert.equal(publication.status, 200); assert.equal((await publication.json()).state, 'pending');
  state = await h.store.read(); assert.equal(state.data.projects.length, 2); assert.equal(state.data.projects[0].slug, 'new-project'); assert.equal(Object.keys(state.drafts).length, 0);
  const unpublish = await send(h.base, 'unpublish', session, { revision: state.revision, slug: 'new-project' }); assert.equal(unpublish.status, 200);
  state = await h.store.read(); assert.equal(state.data.projects.length, 1); assert.ok(state.drafts['new-project']);
  assert.equal((await send(h.base, 'unpublish', session, { revision: state.revision, slug: 'old' })).status, 400);
});
test('editing an existing project as a draft leaves its published version intact', async t => {
  const h = await harness(t), session = await h.login();
  const response = await send(h.base, 'save', session, { revision: '1', action: 'draft', existingSlug: 'old', project: { ...input, slug: 'old', github: 'https://github.com/owner/old', name: 'Updated name' } });
  assert.equal(response.status, 200);
  const state = await h.store.read(); assert.equal(state.data.projects[0].name, 'Old'); assert.equal(state.drafts.old.name, 'Updated name');
});
test('unconfigured deployed functions expose no editable local bypass', async t => {
  const h = await harness(t, { env: {}, local: false });
  const session = await (await send(h.base, 'session')).json(); assert.equal(session.mode, 'setup'); assert.equal(session.authenticated, false);
  assert.equal((await send(h.base, 'projects')).status, 503);
});
