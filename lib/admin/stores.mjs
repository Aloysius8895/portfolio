import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fail } from './domain.mjs';
const DATA = 'template3/projects/projects.json', DRAFTS = 'template3/projects/drafts.json';
export const imagePathAllowed = path => /^(?:template3\/site\/project-discs\/[a-z0-9-]+\.webp|template3\/projects\/uploads\/[a-f0-9]{64}\.(?:png|jpg|webp))$/.test(path);
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function localStore(root) {
  const folder = resolve(root, '.local-admin'), stateFile = resolve(folder, 'state.json');
  let writing = false;
  async function read() {
    let state;
    try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { data: JSON.parse(await readFile(resolve(root, DATA), 'utf8')), drafts: {} }; }
    state.data = JSON.parse(await readFile(resolve(root, DATA), 'utf8'));
    return { ...state, revision: fingerprint(state) };
  }
  return { mode: 'local', read,
    async file(path) {
      if (!imagePathAllowed(path)) fail(400, 'Invalid artwork path.');
      try { return await readFile(resolve(folder, 'files', path)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; return readFile(resolve(root, path)); }
    },
    async save({ revision, data, drafts, files = [], publish }) {
      if (publish) fail(403, 'Local preview can save drafts only. Configure GitHub and Vercel to publish.');
      if (writing) fail(409, 'Another save is in progress. Try again.');
      writing = true;
      try {
        if ((await read()).revision !== revision) fail(409, 'This draft changed in another tab. Reload the project list before saving.');
        for (const file of files) {
          if (!imagePathAllowed(file.path)) fail(400, 'Invalid artwork destination.');
          const destination = resolve(folder, 'files', file.path);
          if (!destination.startsWith(folder + sep)) fail(400, 'Invalid artwork destination.');
          await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, file.content);
        }
        const state = { data, drafts }; await mkdir(folder, { recursive: true });
        await writeFile(stateFile + '.tmp', JSON.stringify(state, null, 2) + '\n');
        await rename(stateFile + '.tmp', stateFile);
        return { revision: fingerprint(state), mode: 'local', state: 'draft' };
      } finally { writing = false; }
    },
  };
}

export function githubStore({ request, repository, branch }) {
  const base = `/repos/${repository}`, branchURL = branch.split('/').map(encodeURIComponent).join('/');
  async function head() { return (await request(`${base}/git/ref/heads/${branchURL}`)).object.sha; }
  async function content(path, revision, optional = false) {
    const file = await request(`${base}/contents/${path}?ref=${encodeURIComponent(revision)}`, { optional });
    if (!file) return null;
    if (file.type !== 'file') fail(502, 'Unexpected repository content.');
    if (file.content && file.encoding === 'base64') return Buffer.from(file.content, 'base64');
    const blob = await request(`${base}/git/blobs/${file.sha}`);
    if (blob.encoding !== 'base64') fail(502, 'Unsupported repository encoding.');
    return Buffer.from(blob.content, 'base64');
  }
  return { mode: 'github',
    async read() {
      const revision = await head();
      const [data, drafts] = await Promise.all([content(DATA, revision), content(DRAFTS, revision, true)]);
      return { revision, data: JSON.parse(data.toString()), drafts: drafts ? JSON.parse(drafts.toString()) : {} };
    },
    async file(path, revision) {
      if (!imagePathAllowed(path)) fail(400, 'Invalid artwork path.');
      return content(path, revision);
    },
    async save({ revision, data, drafts, files = [], user, message }) {
      if (!/^[a-f0-9]{40}$/.test(revision || '') || await head() !== revision) fail(409, 'The portfolio changed. Reload before saving to avoid overwriting newer work.');
      const parent = await request(`${base}/git/commits/${revision}`);
      const entries = [{ path: DATA, content: Buffer.from(JSON.stringify(data, null, 2) + '\n') },
        { path: DRAFTS, content: Buffer.from(JSON.stringify(drafts, null, 2) + '\n') }, ...files];
      const tree = [];
      for (const file of entries) {
        if (![DATA, DRAFTS].includes(file.path) && !imagePathAllowed(file.path)) fail(400, 'Invalid repository write destination.');
        const blob = await request(`${base}/git/blobs`, { method: 'POST', body: { content: file.content.toString('base64'), encoding: 'base64' } });
        tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const createdTree = await request(`${base}/git/trees`, { method: 'POST', body: { base_tree: parent.tree.sha, tree } });
      const commit = await request(`${base}/git/commits`, { method: 'POST', body: { message, tree: createdTree.sha, parents: [revision],
        author: { name: user.login, email: `${user.id}+${user.login}@users.noreply.github.com` } } });
      await request(`${base}/git/refs/heads/${branchURL}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
      return { revision: commit.sha, mode: 'github', state: 'pending', commit: `https://github.com/${repository}/commit/${commit.sha}` };
    },
    async deployment(sha, currentSHA) {
      if (!/^[a-f0-9]{40}$/.test(sha || '')) fail(400, 'Invalid deployment revision.');
      if (sha === currentSHA) return { state: 'live', url: null };
      const result = await request(`${base}/commits/${sha}/status`);
      const checks = (result.statuses || []).filter(item => /vercel/i.test(item.context));
      if (!checks.length) return { state: 'pending', message: 'Saved to GitHub. Waiting for the Vercel Git integration.' };
      const preferred = checks.find(check => check.state === 'failure' || check.state === 'error') || checks.find(check => check.state === 'pending') || checks[0];
      return { state: preferred.state === 'success' ? 'live' : ['failure', 'error'].includes(preferred.state) ? 'failed' : 'pending',
        message: preferred.description || '', url: /^https:\/\//.test(preferred.target_url || '') ? preferred.target_url : null };
    },
  };
}
