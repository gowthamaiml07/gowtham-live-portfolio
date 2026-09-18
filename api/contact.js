'use strict';

/**
 * Vercel serverless function — POST /api/contact
 *
 * No secrets live in this file or anywhere in the browser.
 * RESEND_API_KEY / CONTACT_FROM_EMAIL / CONTACT_TO_EMAIL come from
 * environment variables (configured in the Vercel dashboard or .env locally).
 */

const { handleContact } = require('../lib/contact-service');
const { readJsonBody, MAX_BODY_BYTES } = require('../lib/http');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  return 'unknown';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json.' });
  }

  let body;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err && err.name === 'PayloadTooLargeError') {
      return res.status(413).json({ error: 'Message is too long.' });
    }
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const result = await handleContact({ clientIp: getClientIp(req), body });
  return res.status(result.status).json(result.body);
};