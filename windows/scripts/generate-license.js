#!/usr/bin/env node
const { generateKey, TEST_KEY } = require('../src/license');

const serials = process.argv.slice(2);
console.log('Test unlock:', TEST_KEY);
if (!serials.length) {
  for (const s of ['A1B2', 'DEMO', 'RON1']) {
    console.log(generateKey(s));
  }
  console.log('\nUsage: node scripts/generate-license.js AB12 CUST');
} else {
  for (const s of serials) {
    const k = generateKey(s);
    if (!k) console.error('Invalid serial (4 chars):', s);
    else console.log(k);
  }
}
