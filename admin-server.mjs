import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './lib/admin/handler.mjs';
export const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };
export async function createServer({ env = process.env, fetch: fetcher, root = ROOT, store } = {}) {
  const handler = createHandler({ env, fetch: fetcher, root, local: true, store });
  const mapping = JSON.parse(await readFile(resolve(root, 'template3/asset-map.json'), 'utf8'));
  return http.createServer(async (req, res) => {
    let url; try { url = new URL(req.url, 'http://local'); } catch { res.writeHead(400); res.end(); return; }
    if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) return handler(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      let base, path;
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) { base = resolve(root, 'admin'); path = url.pathname.slice(6) || '/index.html'; }
      else if (url.pathname.startsWith('/hero/')) { base = resolve(root, 'template3/hero'); path = url.pathname.slice(5); }
      else { base = resolve(root, 'template3/site'); path = mapping[url.pathname + url.search] || mapping[url.pathname] || url.pathname; }
      let destination = resolve(base, decodeURIComponent(path).replace(/^\/+/, ''));
      if (!destination.startsWith(base + sep) && destination !== base) throw Error('Invalid path');
      let info;
      try { info = await stat(destination); } catch { if (!extname(destination)) { destination += '.html'; info = await stat(destination); } else throw Error('Missing'); }
      if (info.isDirectory()) { destination = resolve(destination, 'index.html'); info = await stat(destination); }
      const bytes = await readFile(destination), range = req.headers.range;
      res.setHeader('Content-Type', TYPES[extname(destination)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Accept-Ranges', 'bytes');
      let start = 0, end = bytes.length - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || !match[1] && !match[2]) { res.writeHead(416); res.end(); return; }
        start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
        if (start > end || start >= bytes.length) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); res.end(); return; }
        res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
      }
      res.setHeader('Content-Length', end - start + 1); res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--port'), port = at >= 0 ? Number(process.argv[at + 1]) : 8083;
  const server = await createServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the previous preview window before restarting.` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => { console.log(`Chill portfolio: http://127.0.0.1:${port}\nProject admin: http://127.0.0.1:${port}/admin\nLocal preview saves drafts; production publishing requires the GitHub setup.`); });
}
