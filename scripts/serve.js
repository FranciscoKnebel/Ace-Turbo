// Serve only the same public files that are shipped to GitHub Pages.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
export function createStaticServer({ root = ROOT } = {}) {
  return createServer(async (req, res) => {
    const reply = (code, body) => res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }).end(req.method === 'HEAD' ? undefined : body);
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('allow', 'GET, HEAD'); reply(405, 'method not allowed'); return; }
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { reply(400, 'bad request'); return; }
    if (path === '/') path = '/index.html';
    if (!(path === '/index.html' || path.startsWith('/src/') || path.startsWith('/assets/')) || path.split('/').some(segment => segment.startsWith('.') || segment.includes('\\') || segment.includes('\0'))) { reply(403, 'forbidden'); return; }
    try {
      const rootPath = await realpath(root), full = await realpath(resolve(rootPath, '.' + path));
      const publicPath = full.slice(rootPath.length + 1).split(sep).join('/');
      if (!full.startsWith(rootPath + sep) || !(publicPath === 'index.html' || publicPath.startsWith('src/') || publicPath.startsWith('assets/')) || publicPath.split('/').some(segment => segment.startsWith('.'))) { reply(403, 'forbidden'); return; }
      const body = await readFile(full);
      res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream', 'content-length': body.length, 'x-content-type-options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { reply(404, 'not found'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 5173), host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('Invalid PORT');
  createStaticServer().listen(port, host, function () { console.log(`Ace Turbo em http://${host}:${this.address().port}`); });
}
