'use strict';

const NAME_MAX = 100;
const EMAIL_MAX = 254;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;

/**
 * Practical email validation (RFC-conscious but not exhaustive).
 * - length bounds
 * - exactly one @ separating non-whitespace local and domain
 * - domain must contain a dot
 * - local part limited to 64 chars
 */
function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > EMAIL_MAX) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;

  const at = value.lastIndexOf('@');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (domain.length > 255) return false;
  return true;
}

class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Validates a raw contact payload.
 * Returns { name, email, message } on success.
 * Throws ValidationError(field, message) with statusCode 400 on failure.
 */
function validateContact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('form', 'Malformed request.');
  }

  const name = normalizeText(input.name);
  const email = normalizeText(input.email);
  const message = normalizeText(input.message);

  if (!name) {
    throw new ValidationError('name', 'Name is required.');
  }
  if (name.length > NAME_MAX) {
    throw new ValidationError('name', `Name must be under ${NAME_MAX} characters.`);
  }

  if (!email) {
    throw new ValidationError('email', 'Email is required.');
  }
  if (!isValidEmail(email)) {
    throw new ValidationError('email', 'Please enter a valid email address.');
  }

  if (!message) {
    throw new ValidationError('message', 'Message is required.');
  }
  if (message.length < MESSAGE_MIN) {
    throw new ValidationError('message', `Message must be at least ${MESSAGE_MIN} characters.`);
  }
  if (message.length > MESSAGE_MAX) {
    throw new ValidationError('message', `Message must be under ${MESSAGE_MAX} characters.`);
  }

  return { name, email, message };
}

/** Escape untrusted text before inserting into HTML email bodies. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  NAME_MAX,
  EMAIL_MAX,
  MESSAGE_MIN,
  MESSAGE_MAX,
  isValidEmail,
  normalizeText,
  validateContact,
  escapeHtml,
  ValidationError
};