import { random, sign, verify, cookie, cookies, configuration, requireOwner, requireMutation } from './auth.mjs';
import { fail, AppError, parseRepository, validateProject, checkDuplicates, sortProjects } from './domain.mjs';
import { githubClient, importRepository } from './github.mjs';
import { githubStore, localStore } from './stores.mjs';
import { prepareArtwork } from './artwork.mjs';
const MAX_BODY = 4_250_000;
const own = (object, key) => Object.hasOwn(object, key) ? object[key] : undefined;
async function bodyJSON(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Send JSON content.');
  let value = req.body;
  if (value === undefined) {
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > MAX_BODY) fail(413, 'The upload is too large. Use an image below 3 MB.'); chunks.push(chunk); }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') { if (Buffer.byteLength(value) > MAX_BODY) fail(413, 'The upload is too large.'); try { value = JSON.parse(value); } catch { fail(400, 'Invalid JSON.'); } }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > MAX_BODY) fail(400, 'Invalid request body.');
  return value;
}
function json(res, status, value) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); }
function redirect(res, location) { res.statusCode = 302; res.setHeader('Location', location); res.end(); }
export function createHandler({ env = process.env, fetch: fetcher = globalThis.fetch, local = false, root = process.cwd(), store: suppliedStore } = {}) {
  const config = configuration(env, local), secret = env.SESSION_SECRET || random() + random();
  const request = githubClient({ token: env.GITHUB_TOKEN, fetch: fetcher });
  const store = suppliedStore || (config.ready ? githubStore({ request, repository: env.PORTFOLIO_REPOSITORY, branch: config.branch }) : local ? localStore(root) : null);
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, 'http://internal'), route = (url.searchParams.get('route') || url.pathname.replace(/^\/api\/admin\/?/, '')).replace(/\/$/, '');
      const localMode = local && !config.ready;
      if (localMode && (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '') || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))) fail(403, 'Local drafts are available on the loopback server only.');
      const origin = localMode ? `http://${req.headers.host}` : config.origin;
      const secure = origin.startsWith('https://'), jar = cookies(req);
      let session = verify(jar.chill_session, secret);
      if (session && session.type !== (localMode ? 'local' : 'owner')) session = null;
      const setCookie = (name, value, seconds) => res.setHeader('Set-Cookie', cookie(name, value, { secure, seconds }));
      if (route === 'session' && req.method === 'GET') {
        if (localMode && !session) { session = { type: 'local', id: 'local', login: 'Local preview', csrf: random(), exp: Date.now() + 8 * 3600_000 }; setCookie('chill_session', sign(session, secret)); }
        if (!localMode && session && String(session.id) !== env.ADMIN_GITHUB_ID) session = null;
        return json(res, 200, { mode: localMode ? 'local' : config.ready ? 'github' : 'setup', authenticated: !!session,
          user: session ? { login: session.login } : null, csrf: session?.csrf, missing: config.missing,
          canPublish: !localMode && config.ready && !!session });
      }
      if (!config.ready && !localMode) fail(503, 'Online administration is not configured yet. Complete the deployment setup.');
      if (route === 'login' && req.method === 'GET') {
        if (localMode) return redirect(res, '/admin');
        const state = sign({ type: 'oauth', nonce: random(), exp: Date.now() + 10 * 60_000 }, secret);
        setCookie('chill_oauth', state, 600);
        const params = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${origin}/api/admin/callback`, scope: 'read:user', state });
        return redirect(res, `https://github.com/login/oauth/authorize?${params}`);
      }
      if (route === 'callback' && req.method === 'GET') {
        const state = url.searchParams.get('state'), decoded = verify(state, secret);
        setCookie('chill_oauth', '', 0);
        if (!decoded || decoded.type !== 'oauth' || state !== jar.chill_oauth || !url.searchParams.get('code')) fail(403, 'GitHub login expired or was cancelled. Sign in again.');
        const response = await fetcher('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: `${origin}/api/admin/callback` }), signal: AbortSignal.timeout(15000) });
        if (!response.ok) fail(502, 'GitHub login could not be completed.');
        const token = await response.json();
        if (!token.access_token) fail(403, 'GitHub did not approve the login. Try signing in again.');
        const user = await githubClient({ token: token.access_token, fetch: fetcher })('/user');
        requireOwner(user, env);
        session = { type: 'owner', id: String(user.id), login: user.login, csrf: random(), exp: Date.now() + 8 * 3600_000 };
        res.setHeader('Set-Cookie', [cookie('chill_oauth', '', { secure, seconds: 0 }), cookie('chill_session', sign(session, secret), { secure })]);
        return redirect(res, '/admin');
      }
      if (!localMode) requireOwner(session, env);
      else if (!session) fail(401, 'Open the admin page to start a local draft session.');
      const methods = { projects: 'GET', image: 'GET', source: 'GET', deployment: 'GET', import: 'POST', artwork: 'POST', save: 'POST', unpublish: 'POST', logout: 'POST' };
      if (!methods[route]) fail(404, 'Unknown admin endpoint.');
      if (req.method !== methods[route]) fail(405, 'Method not allowed.');
      if (req.method === 'POST') requireMutation(req, origin, session);
      if (route === 'logout') { setCookie('chill_session', '', 0); return json(res, 200, { ok: true }); }
      if (route === 'projects') {
        const state = await store.read();
        return json(res, 200, { ...state, data: { ...state.data, projects: sortProjects(state.data.projects) } });
      }
      if (route === 'import') {
        const input = await bodyJSON(req), result = await importRepository(input.url, request);
        const identity = `${result.metadata.owner.login}/${result.metadata.name}`.toLowerCase();
        return json(res, 200, { ...result.project, reference: result.reference,
          importTicket: sign({ type: 'import', repository: identity, created_at: result.metadata.created_at, exp: Date.now() + 3600_000 }, secret) });
      }
      if (route === 'artwork') {
        const image = await prepareArtwork(await bodyJSON(req));
        return json(res, 200, { preview: `data:image/webp;base64,${image.texture.toString('base64')}`, geometry: image.geometry });
      }
      if (route === 'image' || route === 'source') {
        const state = await store.read(), slug = url.searchParams.get('slug');
        const project = own(state.drafts, slug) || state.data.projects.find(project => project.slug === slug);
        if (!project?.disc) fail(404, 'Artwork not found.');
        const path = route === 'source' ? project.artwork?.source : 'template3/site' + project.disc.split('?')[0];
        if (!path) fail(404, 'Upload the original image to adjust this legacy disk.');
        const file = await store.file(path, state.revision);
        if (route === 'source') return json(res, 200, { data: file.toString('base64'), mime: path.endsWith('.jpg') ? 'image/jpeg' : path.endsWith('.png') ? 'image/png' : 'image/webp' });
        res.statusCode = 200; res.setHeader('Content-Type', 'image/webp'); return res.end(file);
      }
      if (route === 'deployment') {
        if (localMode) return json(res, 200, { state: 'draft', message: 'Local draft only. Online publishing is not configured.' });
        return json(res, 200, await store.deployment(url.searchParams.get('sha'), env.VERCEL_GIT_COMMIT_SHA));
      }
      const input = await bodyJSON(req), state = await store.read();
      if (!input.revision || input.revision !== state.revision) fail(409, 'The project list changed. Reload it before saving so newer work is not overwritten.');
      if (route === 'unpublish') {
        if (localMode) fail(403, 'Unpublishing is available after online setup. Local drafts do not modify the public portfolio.');
        const previous = state.data.projects.find(project => project.slug === input.slug);
        if (!previous) fail(404, 'Published project not found.');
        if (state.data.projects.length < 2) fail(400, 'Keep at least one published project in the disk gallery.');
        state.drafts[input.slug] = own(state.drafts, input.slug) || previous;
        state.data.projects = state.data.projects.filter(project => project.slug !== input.slug);
        return json(res, 200, await store.save({ ...state, user: session, publish: true, message: `Unpublish ${previous.name}` }));
      }
      if (!['draft', 'publish'].includes(input.action)) fail(400, 'Choose Save draft or Publish.');
      if (localMode && input.action === 'publish') fail(403, 'Local preview saves drafts only. Connect GitHub and Vercel to publish.');
      const projectInput = input.project || {}, oldPublished = state.data.projects.find(project => project.slug === projectInput.slug);
      const previous = own(state.drafts, projectInput.slug) || oldPublished;
      if (previous && input.existingSlug !== previous.slug) fail(409, 'That project URL is already in use. Edit the existing project or choose a different slug.');
      if (input.existingSlug && !previous) fail(409, 'The project was removed or renamed. Reload the project list.');
      const repository = parseRepository(projectInput.github), identity = `${repository.owner}/${repository.repo}`.toLowerCase();
      const ticket = verify(input.importTicket, secret);
      let metadata;
      if (previous && `${previous.repo_owner || state.data.owner}/${previous.repo}`.toLowerCase() === identity) metadata = { created_at: previous.created_at };
      else if (ticket?.type === 'import' && ticket.repository === identity) metadata = { created_at: ticket.created_at };
      else {
        metadata = await request(`/repos/${repository.owner}/${repository.repo}`);
        if (metadata.private) fail(400, 'Only public repositories are supported.');
      }
      const project = validateProject(projectInput, metadata, previous);
      checkDuplicates([...state.data.projects, ...Object.values(state.drafts)], project, state.data.owner);
      const files = [];
      if (input.artwork) {
        const image = await prepareArtwork(input.artwork);
        const sourceDigest = (await import('node:crypto')).createHash('sha256').update(image.source).digest('hex');
        const source = `template3/projects/uploads/${sourceDigest}.${image.extension}`;
        const texture = `template3/site/project-discs/${project.slug}-${image.digest.slice(0, 16)}.webp`;
        files.push({ path: source, content: image.source }, { path: texture, content: image.texture });
        project.disc = texture.replace('template3/site', '');
        project.artwork = { source, calibration: image.calibration, geometry: image.geometry };
      }
      if (!project.disc) fail(400, 'Upload and preview a disk image before saving this project.');
      if (input.action === 'publish') {
        project.status = 'published';
        state.data.projects = sortProjects([...state.data.projects.filter(entry => entry.slug !== project.slug), project]);
        delete state.drafts[project.slug];
      } else state.drafts[project.slug] = project;
      return json(res, 200, { ...await store.save({ ...state, files, user: session, publish: input.action === 'publish', message: `${input.action === 'publish' ? 'Publish' : 'Draft'} ${project.name}` }), slug: project.slug });
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (status === 500) console.error('Admin request failed:', error.message);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'The request failed. Your published portfolio was not changed. Please retry.' : error.message });
      else res.end();
    }
  };
}
