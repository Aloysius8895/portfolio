import { AppError, fail, parseRepository } from './domain.mjs';

export function githubClient({ token, fetch: fetcher = globalThis.fetch }) {
  return async function request(path, { method = 'GET', body, optional = false } = {}) {
    let response;
    try {
      response = await fetcher(`https://api.github.com${path}`, {
        method, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
      });
    } catch { fail(502, 'GitHub could not be reached. Your changes have not been published.'); }
    if (optional && response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) fail(409, 'The repository changed. Refresh the project list and retry with the latest revision.');
      if (response.status === 404) fail(404, 'Repository or content not found. Check the URL and repository permissions.');
      if ([401, 403, 429].includes(response.status)) fail(503, 'GitHub access is unavailable or rate limited. Check server credentials and try again later.');
      throw new AppError(502, `GitHub returned ${response.status}. Nothing was marked live.`);
    }
    if (response.status === 204) return null;
    return response.json();
  };
}
export async function importRepository(url, request) {
  const { owner, repo } = parseRepository(url), path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const metadata = await request(path);
  if (metadata.private || !metadata.created_at || !metadata.owner?.login) fail(400, 'Only accessible public repositories can be imported.');
  const [languages, readme] = await Promise.all([
    request(`${path}/languages`).catch(() => ({})), request(`${path}/readme`, { optional: true }).catch(() => null),
  ]);
  const reference = readme?.content && readme.encoding === 'base64' ? Buffer.from(readme.content, 'base64').toString('utf8').slice(0, 24000) : '';
  return { metadata, reference, project: {
    slug: metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'project',
    name: metadata.name, github: `https://github.com/${metadata.owner.login}/${metadata.name}`,
    synopsis: metadata.description || '', intro: metadata.description || '', demo: metadata.homepage || '',
    stack: Object.keys(languages || {}).slice(0, 10), category: 'Software', context: '', team: '', role: '', pitch: '', quote: '', features: [],
    created_at: metadata.created_at,
  } };
}
