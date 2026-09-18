'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  validateContact,
  isValidEmail,
  escapeHtml,
  ValidationError
} = require('../lib/validation');

test('accepts a valid contact payload', () => {
  const out = validateContact({
    name: 'John Doe',
    email: 'john@example.com',
    message: 'I would like to discuss your AI/ML project.'
  });
  assert.strictEqual(out.name, 'John Doe');
  assert.strictEqual(out.email, 'john@example.com');
  assert.strictEqual(typeof out.message, 'string');
});

test('ignores extra/honeypot fields during validation', () => {
  const out = validateContact({
    name: 'John',
    email: 'john@example.com',
    message: 'Hello there, nice work on the CV systems!',
    website: ''
  });
  assert.strictEqual(out.email, 'john@example.com');
});

test('trims whitespace from all fields', () => {
  const out = validateContact({
    name: '  John  ',
    email: ' john@example.com ',
    message: '   Hello, this is a valid message.   '
  });
  assert.strictEqual(out.name, 'John');
  assert.strictEqual(out.email, 'john@example.com');
  assert.ok(out.message.startsWith('Hello'));
});

test('rejects missing or whitespace-only name', () => {
  ['', '   ', undefined, null].forEach((bad) => {
    assert.throws(
      () => validateContact({ name: bad, email: 'a@b.co', message: 'this is a valid message' }),
      (e) => e instanceof ValidationError && e.field === 'name'
    );
  });
});

test('rejects overly long name', () => {
  assert.throws(
    () => validateContact({ name: 'x'.repeat(101), email: 'a@b.co', message: 'this is valid' }),
    (e) => e instanceof ValidationError && e.field === 'name'
  );
});

test('rejects invalid emails', () => {
  ['', 'not-an-email', 'a@b', 'a@b.', 'a b@c.com', '@x.com', 'a@', 'a@@b.com'].forEach((bad) => {
    assert.throws(
      () => validateContact({ name: 'John', email: bad, message: 'this is a valid message' }),
      (e) => e instanceof ValidationError && e.field === 'email',
      `expected rejection for email ${JSON.stringify(bad)}`
    );
  });
});

test('rejects overly long local part in email', () => {
  const longLocal = 'a'.repeat(65) + '@example.com';
  assert.strictEqual(isValidEmail(longLocal), false);
});

test('isValidEmail accepts common valid forms', () => {
  assert.strictEqual(isValidEmail('a@b.co'), true);
  assert.strictEqual(isValidEmail('first.last+tag@sub.example.co.uk'), true);
  assert.strictEqual(isValidEmail('gowtham.aiml07@gmail.com'), true);
});

test('rejects missing / short / whitespace-only message', () => {
  assert.throws(
    () => validateContact({ name: 'John', email: 'a@b.co', message: '' }),
    (e) => e.field === 'message'
  );
  assert.throws(
    () => validateContact({ name: 'John', email: 'a@b.co', message: 'short' }),
    (e) => e.field === 'message'
  );
  assert.throws(
    () => validateContact({ name: 'John', email: 'a@b.co', message: '   ' }),
    (e) => e.field === 'message'
  );
});

test('rejects overly long message', () => {
  assert.throws(
    () => validateContact({ name: 'John', email: 'a@b.co', message: 'x'.repeat(5001) }),
    (e) => e.field === 'message'
  );
});

test('rejects non-object payloads', () => {
  [null, undefined, 'hello', 42, []].forEach((bad) => {
    assert.throws(
      () => validateContact(bad),
      (e) => e instanceof ValidationError && e.field === 'form'
    );
  });
});

test('escapeHtml neutralizes script/HTML injection', () => {
  const html = escapeHtml('<script>alert("x")</script> & \'y\'');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&#39;'));
  assert.ok(html.includes('&quot;'));
});