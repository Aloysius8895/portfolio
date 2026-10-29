import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepository, validateProject, checkDuplicates, sortProjects } from '../lib/admin/domain.mjs';
import { sign, verify, configuration } from '../lib/admin/auth.mjs';
const base = { slug: 'sample', name: 'Sample', github: 'https://github.com/example/demo', synopsis: 'A real project.', stack: ['Python'], features: [] };
test('repository URLs cannot redirect imports to other hosts or arbitrary paths', () => {
  assert.deepEqual(parseRepository('https://github.com/example/demo.git'), { owner: 'example', repo: 'demo' });
  for (const url of ['http://github.com/a/b', 'https://github.com.evil.test/a/b', 'https://github.com/a/b/tree/main', 'https://user@github.com/a/b', 'https://github.com/a/b?x=1', 'https://github.com/a/%2e%2e']) assert.throws(() => parseRepository(url));
});
test('project validation keeps genuine dates, owners and unknown legacy fields but excludes client-controlled artwork', () => {
  const p = validateProject({ ...base, created_at: '2030-01-01', disc: 'javascript:x', team: '', role: '' }, { created_at: '2026-01-02T00:00:00Z' }, { custom: 'retained', disc: '/project-discs/old.webp' });
  assert.equal(p.created_at, '2026-01-02T00:00:00Z'); assert.equal(p.repo_owner, 'example'); assert.equal(p.team, ''); assert.equal(p.custom, 'retained'); assert.equal(p.disc, '/project-discs/old.webp');
  for (const extra of [{ slug: '../evil' }, { demo: 'javascript:alert(1)' }, { stack: 'Python' }, { name: '' }, { features: [['only label']] }]) assert.throws(() => validateProject({ ...base, ...extra }, { created_at: '2026-01-01' }));
});
test('duplicate repositories are case insensitive and project sort is creation time descending', () => {
  assert.throws(() => checkDuplicates([{ slug: 'old', repo_owner: 'Example', repo: 'DEMO' }], { ...base, repo_owner: 'example', repo: 'demo' }));
  assert.deepEqual(sortProjects([{ created_at: '2025' }, { created_at: '2026' }]).map(p => p.created_at), ['2026', '2025']);
});
test('signed state cannot be forged, confused with an expired session or accepted with weak setup', () => {
  const secret = 'a'.repeat(40), token = sign({ exp: Date.now() + 5000, id: 123 }, secret);
  assert.equal(verify(token, secret).id, 123); assert.equal(verify(token + 'x', secret), null); assert.equal(verify(token, 'wrong'), null);
  assert.equal(verify(sign({ exp: 0 }, secret), secret), null);
  assert.equal(configuration({ SESSION_SECRET: 'short' }, false).ready, false);
});
