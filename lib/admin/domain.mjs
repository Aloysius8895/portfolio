export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new AppError(status, message); };
export const hashPath = /^[a-z0-9][a-z0-9-]{0,79}$/;
export function parseRepository(value) {
  let url; try { url = new URL(String(value)); } catch { fail(400, 'Enter a GitHub repository URL.'); }
  const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || parts.length !== 2)
    fail(400, 'Use https://github.com/owner/repository without extra paths.');
  const [owner, raw] = parts, repo = raw.replace(/\.git$/, '');
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) || /^\.+$/.test(repo)) fail(400, 'Invalid GitHub repository.');
  return { owner, repo };
}
export function text(value, label, max = 500, required = false) {
  if (value != null && typeof value !== 'string') fail(400, `${label} must be text.`);
  const result = (value || '').trim();
  if (result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) fail(400, `${label} is too long or contains invalid characters.`);
  if (required && !result) fail(400, `${label} is required.`);
  return result;
}
function webURL(value) {
  value = text(value, 'Demo URL', 500);
  if (!value) return '';
  let url; try { url = new URL(value); } catch { fail(400, 'Enter a valid demo URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail(400, 'Demo links must use HTTP or HTTPS.');
  return url.href;
}
export function validateProject(input, metadata, previous = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid project.');
  const slug = text(input.slug, 'Slug', 80, true);
  if (!hashPath.test(slug)) fail(400, 'Use lowercase letters, numbers and hyphens for the slug.');
  if (previous.slug && slug !== previous.slug) fail(400, 'The URL slug cannot change after a project has been saved.');
  const repository = parseRepository(input.github);
  const created = new Date(metadata.created_at);
  if (!Number.isFinite(created.getTime())) fail(400, 'The repository creation date is unavailable. Try importing it again.');
  const stack = input.stack ?? [];
  if (!Array.isArray(stack) || stack.length > 20) fail(400, 'Use at most 20 technology tags.');
  const features = input.features ?? [];
  if (!Array.isArray(features) || features.length > 12 || features.some(row => !Array.isArray(row) || row.length !== 2)) fail(400, 'Features must contain a label and description.');
  return {
    ...previous, slug, repo_owner: repository.owner, repo: repository.repo,
    name: text(input.name, 'Project name', 100, true),
    category: text(input.category, 'Category', 80) || 'Software',
    context: text(input.context, 'Context', 200), role: text(input.role, 'Your role', 200), team: text(input.team, 'Team', 200),
    synopsis: text(input.synopsis, 'Short description', 700, true), intro: text(input.intro, 'Introduction', 6000),
    pitch: text(input.pitch, 'Short headline', 150) || text(input.name, 'Project name', 100),
    quote: text(input.quote, 'Highlight', 200), demo: webURL(input.demo),
    stack: [...new Set(stack.map(tag => text(tag, 'Technology', 50, true)))],
    features: features.map(([label, value]) => [text(label, 'Feature label', 80, true), text(value, 'Feature description', 500, true)]),
    created_at: created.toISOString().replace('.000Z', 'Z'), created_date: created.toISOString().slice(0, 10),
    created_at_source: `https://api.github.com/repos/${repository.owner}/${repository.repo}`,
    year: String(created.getUTCFullYear()),
  };
}
export function checkDuplicates(projects, candidate, legacyOwner = '') {
  if (projects.some(project => project.slug !== candidate.slug && `${project.repo_owner || legacyOwner}/${project.repo}`.toLowerCase() === `${candidate.repo_owner}/${candidate.repo}`.toLowerCase()))
    fail(409, 'This repository already belongs to another project. Edit that project instead.');
}
export const sortProjects = projects => [...projects].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
