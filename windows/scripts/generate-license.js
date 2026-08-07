#!/usr/bin/env node
// Requires the secret to be present (scripts/private/license-secret.txt or
// CLUTTERDOCK_LICENSE_SECRET) — run scripts/write-license-secret.js first.
const { generateKey } = require('../src/license');

const serials = process.argv.slice(2);
if (!serials.length) {
  console.log('Usage: node scripts/generate-license.js AB12 CUST');
} else {
  for (const s of serials) {
    const k = generateKey(s);
    if (!k) console.error('Invalid serial (4 chars):', s);
    else console.log(k);
  }
}
