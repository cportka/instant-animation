#!/usr/bin/env node
// Dependency-free static server for local preview: `npm run serve`.
// Serves ./site exactly the way GitHub Pages will.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../site', import.meta.url)));
const port = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, relative);

  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }

  // Never serve outside ./site.
  if (!resolve(file).startsWith(root)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`instant-animation → http://localhost:${port}/`);
});
