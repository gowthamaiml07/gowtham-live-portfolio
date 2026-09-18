'use strict';

const { validateContact, ValidationError } = require('./validation');
const { sendContactEmail } = require('./resend');

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5; // max 5 attempts per minute per client IP

// In-memory sliding-window limiter. Note: serverless instances reset this on
// cold start; it is a lightweight anti-spam layer, not a complete defense.
const ipHits = new Map();

function allowRequest(clientIp) {
  const now = Date.now();
  const key = clientIp || 'unknown';
  const hits = (ipHits.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) return false;
  hits.push(now);
  ipHits.set(key, hits);
  return true;
}

/**
 * Process a contact submission. Shared by all runtime adapters
 * (Vercel function, Netlify function, local dev server).
 *
 * @param {{ clientIp: string, body: unknown }} input
 * @returns {Promise<{ status: number, body: unknown }>}
 */
async function handleContact({ clientIp, body }) {
  if (!allowRequest(clientIp)) {
    return {
      status: 429,
      body: { error: 'Too many requests. Please wait a moment and try again.' }
    };
  }

  // Honeypot: a real visitor can never fill this field. If it arrives filled,
  // it is a bot — reply success but silently discard the submission.
  if (
    body &&
    typeof body === 'object' &&
    typeof body.website === 'string' &&
    body.website.trim().length > 0
  ) {
    return { status: 200, body: { success: true, message: 'Message sent successfully!' } };
  }

  let data;
  try {
    data = validateContact(body);
  } catch (err) {
    if (err instanceof ValidationError) {
      return { status: 400, body: { error: err.message, field: err.field } };
    }
    return { status: 400, body: { error: 'Invalid request.' } };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  const to = process.env.CONTACT_TO_EMAIL || 'gowtham.aiml07@gmail.com';

  if (!apiKey || !from) {
    // Deliberate developer-facing config error — never pretend the email was sent.
    console.error('[contact] Contact service is not configured: missing RESEND_API_KEY or CONTACT_FROM_EMAIL.');
    return {
      status: 500,
      body: {
        error: 'Contact service is not configured yet. Please email gowtham.aiml07@gmail.com directly.'
      }
    };
  }

  try {
    await sendContactEmail({ apiKey, from, to, ...data });
    return { status: 200, body: { success: true, message: 'Message sent successfully!' } };
  } catch (err) {
    // Log full detail server-side only; never echo provider errors to the visitor.
    console.error('[contact] Email delivery failed:', err && err.code, err && err.message);
    return {
      status: 502,
      body: {
        error: 'Message could not be delivered right now. Please email gowtham.aiml07@gmail.com directly.'
      }
    };
  }
}

module.exports = { handleContact, allowRequest, RATE_LIMIT_MAX };