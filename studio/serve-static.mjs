import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'dist');
const port = Number(process.argv[3] || 4173);

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const safeUrl = new URL(req.url ?? '/', `http://localhost:${port}`).pathname;
  let filePath = path.join(root, safeUrl === '/' ? 'index.html' : safeUrl);
  const ext = path.extname(filePath).toLowerCase();
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      try {
        const html = await fs.readFile(path.join(root, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    } else {
      res.writeHead(500);
      res.end(String(err));
    }
  }
});

server.listen(port, () => {
  console.log(`static server running on http://localhost:${port}`);
});
