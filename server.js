'use strict';

/**
 * Zero-dependency local dev server.
 *
 * Serves the static portfolio AND exposes the same contact endpoint the
 * serverless functions expose, so you can test the full form locally:
 *
 *   node server.js            (or: npm run dev)
 *   -> http://localhost:3000
 *   -> POST /api/contact  and  POST /.netlify/functions/contact
 *
 * Reads optional `.env` (no dotenv dependency). Supports GET/HEAD for static
 * files and POST/OPTIONS for the contact endpoint.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// --- Load `.env` if present (keeps secrets out of git; only local usage) ---
// SKIP_DOTENV=1 disables this so automated tests can control configuration
// exactly (and stay independent of a developer's local `.env`).
const SKIP_DOTENV = process.env.SKIP_DOTENV === '1';
if (!SKIP_DOTENV) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    });
  } catch (err) {
    // No .env file — rely on the process environment.
  }
}

const { handleContact } = require('./lib/contact-service');
const { readJsonBody, MAX_BODY_BYTES } = require('./lib/http');

const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf'
};

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(text);
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  return 'unknown';
}

async function handleApi(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json')) {
    return sendJson(res, 415, { error: 'Content-Type must be application/json.' });
  }

  let body;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err && err.name === 'PayloadTooLargeError') {
      return sendJson(res, 413, { error: 'Message is too long.' });
    }
    return sendJson(res, 400, { error: 'Invalid request body.' });
  }

  const result = await handleContact({ clientIp: getClientIp(req), body });
  return sendJson(res, result.status, result.body);
}

function serveStatic(req, res, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let filePath = path.normalize(path.join(ROOT, decoded));

  // Path-traversal guard.
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return sendText(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return sendText(res, 404, 'Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Contact endpoints (both aliases so the frontend host-detection always works locally).
  if (url.pathname === '/api/contact' || url.pathname === '/.netlify/functions/contact') {
    return handleApi(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Method not allowed');
  }

  const pathName = url.pathname === '/' ? '/index.html' : url.pathname;
  return serveStatic(req, res, pathName);
});

server.listen(PORT, () => {
  const hasProfile = fs.existsSync(path.join(ROOT, 'profile.jpg'));
  console.log('');
  console.log('  Gowtham Portfolio — local server');
  console.log(`    http://localhost:${PORT}`);
  console.log('');
  if (!hasProfile) {
    console.log('  Note: profile.jpg not found — hero image will show the inline placeholder.');
  }
  if (!process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL) {
    console.log('  Contact form: NOT configured. Copy .env.example to .env and add:');
    console.log('    RESEND_API_KEY=...  CONTACT_FROM_EMAIL=...');
    console.log('  Until then the form shows a clear "not configured" error (no fake sends).');
    console.log('');
  }
});

module.exports = { server };