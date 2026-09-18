'use strict';

const { escapeHtml } = require('./validation');

// Resend REST API. URL is overridable so tests can point at a mock provider.
const RESEND_API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails';

function buildTextBody({ name, email, message, submittedAt }) {
  return [
    'New message from your portfolio',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    '',
    'Message:',
    message,
    '',
    `Submitted: ${submittedAt}`
  ].join('\n');
}

function buildHtmlBody({ name, email, message, submittedAt }) {
  // All visitor-controlled values are HTML-escaped to prevent HTML/script injection
  // into the email the portfolio owner receives.
  const n = escapeHtml(name);
  const e = escapeHtml(email);
  const m = escapeHtml(message).replace(/\r?\n/g, '<br>');
  const t = escapeHtml(submittedAt);
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;line-height:1.6;max-width:560px">',
    '  <h2 style="margin:0 0 16px">New message from your portfolio</h2>',
    `  <p><strong>Name:</strong> ${n}</p>`,
    `  <p><strong>Email:</strong> <a href="mailto:${e}">${e}</a></p>`,
    '  <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />',
    '  <p><strong>Message:</strong></p>',
    `  <blockquote style="margin:8px 0 0;padding:12px 16px;background:#f7f7fb;border-left:3px solid #7c3aed;border-radius:4px">${m}</blockquote>`,
    `  <p style="color:#777;font-size:12px;margin-top:20px">Submitted: ${t}</p>`,
    '</div>'
  ].join('\n');
}

/**
 * Send a contact-submission email through the Resend API via plain fetch
 * (Node 18+ global fetch — no SDK/third-party dependency required).
 *
 * The visitor's address is set as reply_to, the verified-domain address as
 * `from`, and the portfolio address as the single recipient.
 */
async function sendContactEmail({ apiKey, from, to, name, email, message }) {
  if (!apiKey) {
    const err = new Error('Missing RESEND_API_KEY.');
    err.code = 'MISSING_CONFIG';
    throw err;
  }
  if (!from) {
    const err = new Error('Missing CONTACT_FROM_EMAIL.');
    err.code = 'MISSING_CONFIG';
    throw err;
  }

  const submittedAt = new Date().toISOString();
  const subject = `New Portfolio Contact — ${String(name).replace(/[\r\n]+/g, ' ')}`;

  const payload = {
    from,
    to: [to],
    reply_to: email,
    subject,
    text: buildTextBody({ name, email, message, submittedAt }),
    html: buildHtmlBody({ name, email, message, submittedAt })
  };

  let res;
  try {
    res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    err.code = 'PROVIDER_NETWORK_ERROR';
    throw err;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Email provider returned status ${res.status}.`);
    err.code = 'PROVIDER_ERROR';
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  return res.json();
}

module.exports = { sendContactEmail, buildTextBody, buildHtmlBody };