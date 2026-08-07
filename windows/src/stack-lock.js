const crypto = require('crypto');

/**
 * Password-protected stacks.
 *
 * Format is deliberately identical to the Mac implementation
 * (ClutterDock/Models/StackLock.swift) so `.clutterdock` packs stay portable:
 * PBKDF2-HMAC-SHA256 -> 32-byte key -> AES-256-GCM over the JSON item array.
 *
 *   lock: { v: 1, salt: base64, iter: 200000, nonce: base64, ct: base64 }
 *
 * `ct` is ciphertext followed by the 16-byte GCM tag, matching CryptoKit's
 * combined representation minus the leading nonce.
 */

const ITERATIONS = 200000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(password, salt, iterations) {
  return crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, KEY_BYTES, 'sha256');
}

/** Encrypts items under password. Verifies the round-trip before returning. */
function lockItems(items, password) {
  if (!password) throw new Error('Enter a password.');
  const salt = crypto.randomBytes(SALT_BYTES);
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const key = deriveKey(password, salt, ITERATIONS);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const body = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(items), 'utf8')),
    cipher.final(),
    // Tag is appended so the payload matches CryptoKit's combined layout
  ]);
  const payload = {
    v: 1,
    salt: salt.toString('base64'),
    iter: ITERATIONS,
    nonce: nonce.toString('base64'),
    ct: Buffer.concat([body, cipher.getAuthTag()]).toString('base64'),
  };

  // Never drop plaintext without proving it can be recovered
  const check = unlockItems(payload, password);
  if (JSON.stringify(check) !== JSON.stringify(items)) {
    throw new Error('Could not verify the encrypted stack.');
  }
  return payload;
}

/** Decrypts a lock payload. Throws on a wrong password or tampering. */
function unlockItems(payload, password) {
  if (!password) throw new Error('Enter a password.');
  if (!payload || !payload.salt || !payload.nonce || !payload.ct) {
    throw new Error('This stack’s locked data couldn’t be read.');
  }
  const salt = Buffer.from(payload.salt, 'base64');
  const nonce = Buffer.from(payload.nonce, 'base64');
  const combined = Buffer.from(payload.ct, 'base64');
  if (combined.length < TAG_BYTES) throw new Error('This stack’s locked data couldn’t be read.');

  const body = combined.subarray(0, combined.length - TAG_BYTES);
  const tag = combined.subarray(combined.length - TAG_BYTES);
  const key = deriveKey(password, salt, payload.iter || ITERATIONS);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch (_) {
    // A wrong password is indistinguishable from tampering by design
    throw new Error('That password didn’t unlock this stack.');
  }
}

/** Re-encrypts an unlocked stack, reusing its salt so the password still works. */
function relockItems(items, existing, password) {
  const salt = Buffer.from(existing.salt, 'base64');
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const key = deriveKey(password, salt, existing.iter || ITERATIONS);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const body = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(items), 'utf8')),
    cipher.final(),
  ]);
  return {
    v: existing.v || 1,
    salt: existing.salt,
    iter: existing.iter || ITERATIONS,
    nonce: nonce.toString('base64'),
    ct: Buffer.concat([body, cipher.getAuthTag()]).toString('base64'),
  };
}

module.exports = { lockItems, unlockItems, relockItems, ITERATIONS };
