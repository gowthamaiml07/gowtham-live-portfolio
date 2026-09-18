'use strict';

const MAX_BODY_BYTES = 10 * 1024; // 10 KB ceiling for any contact submission

function createPayloadTooLargeError() {
  const err = new Error('Payload too large.');
  err.name = 'PayloadTooLargeError';
  return err;
}

function createInvalidJsonError() {
  const err = new Error('Invalid JSON.');
  err.name = 'InvalidJsonError';
  return err;
}

/**
 * Read and parse a JSON request body from a Node IncomingMessage,
 * enforcing a hard size limit to reject oversized payloads early.
 *
 * Resolves with the parsed object. Rejects with a named error:
 *   - PayloadTooLargeError
 *   - InvalidJsonError
 *   - Error('Empty body.')
 *   - the raw stream error
 */
function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        // Drain/disregard excess payload instead of destroying the socket so we
        // can still respond with a clean 413 (and keep the keep-alive working).
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (tooLarge) {
        reject(createPayloadTooLargeError());
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        reject(new Error('Empty body.'));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(createInvalidJsonError());
      }
    });

    req.on('error', fail);
  });
}

module.exports = {
  MAX_BODY_BYTES,
  readJsonBody,
  createPayloadTooLargeError,
  createInvalidJsonError
};