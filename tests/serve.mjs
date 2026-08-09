// Minimal static server with SPA fallback, so the built app can be driven
// over plain HTTP (the dev server uses a self-signed cert Chrome refuses).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = 5199;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Same-origin page that does NOT boot the app, so a test can set up an old
  // database before the app ever opens it.
  if (url.pathname === '/blank.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>blank</title><body>blank');
    return;
  }

  let file = join(ROOT, normalize(decodeURIComponent(url.pathname)));

  let body;
  try {
    body = await readFile(file);
  } catch {
    file = join(ROOT, 'index.html'); // SPA fallback
    body = await readFile(file);
  }

  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`));
