import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { localStore, githubStore } from '../lib/admin/stores.mjs';
test('local drafts survive a new store instance, reject stale revisions and never change the public data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chill-draft-'));
  try {
    await mkdir(join(root, 'template3/projects'), { recursive: true }); const path = join(root, 'template3/projects/projects.json');
    const original = JSON.stringify({ owner: 'test', projects: [] }); await writeFile(path, original);
    const store = localStore(root), initial = await store.read();
    await store.save({ ...initial, drafts: { sample: { name: 'Sample' } } });
    assert.equal((await localStore(root).read()).drafts.sample.name, 'Sample');
    await assert.rejects(() => store.save({ ...initial, drafts: {} }), /changed/);
    await assert.rejects(() => store.save({ ...initial, publish: true }), /drafts only/);
    assert.equal(await readFile(path, 'utf8'), original);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('chill-draft-'));
    await rm(root, { recursive: true, force: true });
  }
});
test('GitHub save publishes one complete tree with a non-forced ref update, and stale edits never write', async () => {
  const head = 'a'.repeat(40), calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path.includes('/git/ref/')) return { object: { sha: head } };
    if (path.endsWith(`/git/commits/${head}`)) return { tree: { sha: 'base-tree' } };
    if (path.endsWith('/git/blobs')) return { sha: `blob-${calls.length}` };
    if (path.endsWith('/git/trees')) return { sha: 'complete-tree' };
    if (path.endsWith('/git/commits')) return { sha: 'b'.repeat(40) };
    if (path.includes('/git/refs/')) return {};
    throw Error(path);
  };
  const store = githubStore({ request, repository: 'owner/portfolio', branch: 'main' });
  await assert.rejects(() => store.save({ revision: 'c'.repeat(40) }), /changed/);
  assert.equal(calls.filter(call => call.method === 'POST').length, 0); calls.length = 0;
  const result = await store.save({ revision: head, data: { projects: [] }, drafts: {}, files: [{ path: 'template3/site/project-discs/sample.webp', content: Buffer.from('image') }], user: { id: 123, login: 'owner' }, message: 'Publish sample' });
  assert.equal(result.state, 'pending');
  const tree = calls.find(call => call.path.endsWith('/git/trees')).body;
  assert.equal(tree.base_tree, 'base-tree'); assert.equal(tree.tree.length, 3);
  const last = calls.at(-1); assert.equal(last.method, 'PATCH'); assert.equal(last.body.force, false);
});
