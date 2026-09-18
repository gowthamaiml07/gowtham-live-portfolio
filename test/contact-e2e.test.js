'use strict';

/**
 * End-to-end test for the contact pipeline.
 *
 * Spawns the local server with a mock Resend endpoint and verifies that a
 * valid submission produces a REAL email request with the correct
 * From / To / Reply-To / Subject / Body, that bots get dropped, validation is
 * enforced server-side, oversized payloads are rejected, and an unconfigured
 * server returns a clear config error instead of faking success.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASE = 19000 + Math.floor(Math.random() * 800);
const STATIC_PORT = BASE;       // server process
const PROVIDER_PORT = BASE + 1; // mock Resend

let provider;
let receivedEmails = [];
let serverProc;

function startMockProvider() {
  return new Promise((resolve) => {
    provider = http.createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'mock only accepts POST' }));
        return;
      }
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        receivedEmails.push({
          authorization: req.headers.authorization,
          content_type: req.headers['content-type'],
          body: JSON.parse(data)
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'mock_' + receivedEmails.length }));
      });
    });
    provider.listen(PROVIDER_PORT, '127.0.0.1', resolve);
  });
}

function stopMockProvider() {
  return new Promise((resolve) => provider.close(resolve));
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      // SKIP_DOTENV keeps tests independent of any developer `.env` file so
      // each scenario controls configuration explicitly.
      env: { ...process.env, SKIP_DOTENV: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
    serverProc.stdout.on('data', (d) => process.stderr.write(`[server] ${d}`));
    serverProc.once('error', reject);
    waitForServer(`http://127.0.0.1:${env.PORT}/`, 8000)
      .then(resolve)
      .catch(reject);
  });
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return;
    } catch (err) {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Local server did not start in time');
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProc) return resolve();
    serverProc.once('exit', resolve);
    serverProc.kill('SIGTERM');
  });
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

const VALID_MESSAGE = 'Hello! I would like to talk about <b>your AI/ML project</b> & systems with you.';

test('contact flow end-to-end (configured server)', async () => {
  await startMockProvider();
  receivedEmails = [];

  await startServer({
    PORT: String(STATIC_PORT),
    RESEND_API_KEY: 're_test_123',
    RESEND_API_URL: `http://127.0.0.1:${PROVIDER_PORT}`,
    CONTACT_FROM_EMAIL: 'contact@gowtham.tech',
    CONTACT_TO_EMAIL: 'gowtham.aiml07@gmail.com'
  });

  const api = `http://127.0.0.1:${STATIC_PORT}/api/contact`;

  // 1) Valid submission → 200 + exactly one email request with correct fields
  const ok = await post(api, {
    name: 'Alice Doe',
    email: 'alice@example.com',
    message: VALID_MESSAGE
  });
  assert.strictEqual(ok.status, 200, 'valid submission should return 200');
  const okBody = await ok.json();
  assert.strictEqual(okBody.success, true);

  assert.strictEqual(receivedEmails.length, 1, 'exactly one email should be sent');
  const email = receivedEmails[0].body;
  assert.strictEqual(email.to[0], 'gowtham.aiml07@gmail.com');
  assert.strictEqual(email.from, 'contact@gowtham.tech');
  assert.strictEqual(email.reply_to, 'alice@example.com');
  assert.ok(email.subject.includes('Alice Doe'), 'subject should include visitor name');
  assert.ok(email.text.includes('alice@example.com'), 'text body should include visitor email');
  assert.ok(email.text.includes(VALID_MESSAGE));
  assert.ok(email.text.includes('Submitted:'), 'text body should include a timestamp');
  assert.ok(email.html.includes('&lt;b&gt;'), 'html body should escape injected HTML');
  assert.ok(email.html.includes('&amp;'), 'html body should escape ampersands');
  assert.match(receivedEmails[0].authorization || '', /Bearer/, 'provider auth should be sent');

  // 2) Honeypot filled → silent success, NO email sent
  const bot = await post(api, {
    name: 'Bot',
    email: 'bot@example.com',
    message: 'spam spam spam spam spam',
    website: 'http://spam.example'
  });
  assert.strictEqual(bot.status, 200, 'honeypot should return success to hide from bots');
  assert.strictEqual(receivedEmails.length, 1, 'honeypot submissions must NOT deliver email');

  // 3) Invalid email → 400, no delivery
  const badEmail = await post(api, {
    name: 'Sam',
    email: 'not-an-email',
    message: VALID_MESSAGE
  });
  assert.strictEqual(badEmail.status, 400);
  assert.strictEqual(receivedEmails.length, 1);

  // 4) Missing name → 400, no delivery
  const noName = await post(api, { name: '   ', email: 'sam@example.com', message: VALID_MESSAGE });
  assert.strictEqual(noName.status, 400);
  assert.strictEqual(receivedEmails.length, 1);

  // 5) Oversized payload → 413, no delivery, no crash
  const huge = await post(api, {
    name: 'Hugo',
    email: 'hugo@example.com',
    message: 'x'.repeat(12 * 1024)
  });
  assert.strictEqual(huge.status, 413);
  assert.strictEqual(receivedEmails.length, 1);

  // 6) Wrong method → 405
  const wrongMethod = await fetch(api);
  assert.strictEqual(wrongMethod.status, 405);

  // 7) Non-JSON content type → 415
  const nonJson = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'name=John&email=john@example.com&message=hello there a valid message'
  });
  assert.strictEqual(nonJson.status, 415);
});

test('unconfigured server returns a clear config error (no fake success)', async () => {
  await stopServer();

  const env = {
    PORT: String(STATIC_PORT),
    CONTACT_TO_EMAIL: 'gowtham.aiml07@gmail.com'
  };
  delete env.RESEND_API_KEY;
  delete env.RESEND_API_URL;
  delete env.CONTACT_FROM_EMAIL;

  await startServer(env);

  const api = `http://127.0.0.1:${STATIC_PORT}/api/contact`;
  const res = await post(api, {
    name: 'Dev Reporter',
    email: 'dev@example.com',
    message: VALID_MESSAGE
  });
  assert.strictEqual(res.status, 500);
  const body = await res.json();
  assert.ok(/not configured/i.test(body.error), 'error should clearly state not configured');
  assert.strictEqual(receivedEmails.length, 1, 'no delivery should have occurred');

  await stopServer();
  await stopMockProvider();
});