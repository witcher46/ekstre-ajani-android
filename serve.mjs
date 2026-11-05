import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const types = new Map([
  ['index.html', 'text/html; charset=utf-8'], ['style.css', 'text/css; charset=utf-8'],
  ['app.mjs', 'text/javascript; charset=utf-8'], ['model.mjs', 'text/javascript; charset=utf-8'],
  ['sample.mjs', 'text/javascript; charset=utf-8'], ['sw.js', 'text/javascript; charset=utf-8'],
  ['manifest.webmanifest', 'application/manifest+json'], ['icon-192.png', 'image/png'], ['icon-512.png', 'image/png']
]);
const port = Number(process.env.EKSTRE_MOBILE_PORT || 4173);
const host = process.env.EKSTRE_MOBILE_HOST || '127.0.0.1';
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? 'index.html' : req.url?.slice(1);
  if (!['GET', 'HEAD'].includes(req.method) || !types.has(path)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL(path, import.meta.url));
    res.writeHead(200, { 'Content-Type': types.get(path), 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff' }).end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500).end();
  }
});
server.listen(port, host, () => console.log(`http://${host}:${server.address().port}`));
