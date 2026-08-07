#!/usr/bin/env node
// Sanity tests for the license scheme. Run with `npm test` (also in CI before packaging).
// The Mac validator (ClutterDock/Models/LicenseManager.swift) implements the identical
// algorithm; these tests guard the shared format invariants.
const assert = require('assert');
const { validate, generateKey } = require('../src/license');

// Generated keys must round-trip validation (the v1.1.3 bug: length check said 16, keys are 17).
for (const serial of ['A1B2', 'DEMO', 'ZZ99']) {
  const key = generateKey(serial);
  assert.ok(key, `generateKey(${serial}) returned nothing`);
  assert.strictEqual(key.replace(/-/g, '').length, 17, `key compact length must be 17: ${key}`);
  assert.ok(validate(key), `generated key must validate: ${key}`);
  assert.ok(validate(key.toLowerCase()), `validation must be case-insensitive: ${key}`);
}

// Tampered keys must fail.
const good = generateKey('A1B2');
assert.ok(!validate(good.slice(0, -1) + (good.endsWith('0') ? '1' : '0')), 'tampered key must fail');
assert.ok(!validate('SDPRO-A1B2-0000-000'), 'wrong-length key must fail');
assert.ok(!validate(''), 'empty key must fail');
assert.ok(!validate(null), 'null key must fail');

console.log('license tests passed');
