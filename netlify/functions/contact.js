'use strict';

/**
 * Netlify serverless function — POST /.netlify/functions/contact
 *
 * Same shared handler as the Vercel function. No secrets in this file;
 * all configuration comes from Netlify environment variables.
 */

const { handleContact } = require('../../lib/contact-service');
const { MAX_BODY_BYTES } = require('../../lib/http');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const contentType = String(event.headers['content-type'] || event.headers['Content-Type'] || '');
  if (!contentType.includes('application/json')) {
    return jsonResponse(415, { error: 'Content-Type must be application/json.' });
  }

  const raw = event.body || '';
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Message is too long.' });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }

  const forwarded = event.headers['x-forwarded-for'] || event.headers['client-ip'];
  const clientIp = forwarded ? String(forwarded).split(',')[0].trim() : 'unknown';

  const result = await handleContact({ clientIp, body });
  return jsonResponse(result.status, result.body);
};