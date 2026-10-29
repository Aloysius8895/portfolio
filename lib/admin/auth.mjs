import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fail } from './domain.mjs';
export const random = () => randomBytes(24).toString('base64url');
export function sign(value, secret) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function verify(value, secret, now = Date.now()) {
  try {
    const [payload, signature, extra] = String(value).split('.');
    if (extra || !payload || !signature) return null;
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof decoded.exp === 'number' && decoded.exp > now ? decoded : null;
  } catch { return null; }
}
export function cookies(req) {
  const result = {};
  for (const pair of String(req.headers.cookie || '').split(';')) {
    const at = pair.indexOf('=');
    if (at > 0) result[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  }
  return result;
}
export function cookie(name, value, { secure = true, seconds = 28800 } = {}) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
}
export function configuration(env, local) {
  const required = ['PUBLIC_BASE_URL', 'ADMIN_GITHUB_ID', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_TOKEN', 'PORTFOLIO_REPOSITORY', 'SESSION_SECRET'];
  const missing = required.filter(key => !env[key]);
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (at least 32 characters)');
  if (env.ADMIN_GITHUB_ID && !/^\d+$/.test(env.ADMIN_GITHUB_ID)) missing.push('ADMIN_GITHUB_ID (numeric)');
  if (env.PORTFOLIO_REPOSITORY && !/^[\w-]+\/[\w.-]+$/.test(env.PORTFOLIO_REPOSITORY)) missing.push('PORTFOLIO_REPOSITORY (owner/repository)');
  const branch = env.PORTFOLIO_BRANCH || 'main';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,99}$/.test(branch) || branch.includes('//')) missing.push('PORTFOLIO_BRANCH');
  let origin = ''; try { const u = new URL(env.PUBLIC_BASE_URL); if (u.pathname !== '/' || u.search || u.hash || u.username || u.password || (u.protocol !== 'https:' && !(local && ['127.0.0.1', 'localhost'].includes(u.hostname)))) throw Error(); origin = u.origin; } catch { if (env.PUBLIC_BASE_URL) missing.push('PUBLIC_BASE_URL (HTTPS origin)'); }
  return { ready: missing.length === 0, missing: [...new Set(missing)], origin, branch };
}
export function requireOwner(session, env) {
  if (!session || String(session.id) !== String(env.ADMIN_GITHUB_ID)) fail(401, 'Sign in with the authorized GitHub account.');
  return session;
}
export function requireMutation(req, origin, session) {
  if (req.headers.origin !== origin || !session?.csrf || req.headers['x-csrf-token'] !== session.csrf) fail(403, 'The session or page origin changed. Reload the admin page and try again.');
}
