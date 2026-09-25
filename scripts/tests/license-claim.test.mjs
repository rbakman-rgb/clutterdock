import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { claimLicense } from '../license-claim.mjs';

const receipt = '38b1460a-5104-4067-a91d-77b872934d51';
const proof = 'CDPRO2-95D1CEBC39FC7DD5945F7A10ECAC34FF-71591E2762A164FB5F85AABA1EF8C727';
const env = {
  LICENSE_SECRET: 'test-secret-not-shipped', LEMON_STORE_ID: '123', LEMON_PRODUCT_IDS: '456,789',
  LICENSE_RATE_LIMIT: { limit: async () => ({ success: true }) },
};
const validResult = () => ({ valid: true, license_key: { key: receipt, status: 'inactive', expires_at: null }, meta: { store_id: 123, product_id: 456 } });
const request = (key = receipt) => new Request('https://clutterdock.com/api/license/claim', { method: 'POST', body: JSON.stringify({ licenseKey: key }) });
const respond = value => async () => Response.json(value);

test('valid live purchase yields a stable, offline, domain-separated proof', async () => {
  const response = await claimLicense(request(), env, async (url, options) => {
    assert.equal(url, 'https://api.lemonsqueezy.com/v1/licenses/validate');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('license_key'), receipt);
    assert.equal(options.redirect, 'error');
    return Response.json(validResult());
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { licenseKey: proof });
  assert.deepEqual(await (await claimLicense(request(receipt.toUpperCase()), env, respond(validResult()))).json(), { licenseKey: proof });
});

for (const [name, mutate] of [
  ['other store', r => r.meta.store_id = 999],
  ['other product', r => r.meta.product_id = 999],
  ['disabled key', r => r.license_key.status = 'disabled'],
  ['expired key', r => r.license_key.expires_at = '2020-01-01T00:00:00Z'],
  ['malformed expiry', r => r.license_key.expires_at = 'broken'],
  ['test key', r => r.license_key.test_mode = true],
  ['test metadata', r => r.meta.test_mode = true],
  ['invalid key', r => r.valid = false],
  ['different returned key', r => r.license_key.key = 'a'.repeat(36)],
  ['missing metadata', r => delete r.meta],
]) {
  test(`rejects ${name}`, async () => {
    const result = validResult(); mutate(result);
    const response = await claimLicense(request(), env, respond(result));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).licenseKey, undefined);
  });
}
test('rejects bad, oversized and unconfigured requests before contacting merchant', async () => {
  const noFetch = () => { throw new Error('must not fetch'); };
  assert.equal((await claimLicense(request('bad'), env, noFetch)).status, 400);
  assert.equal((await claimLicense(request('x'.repeat(2000)), env, noFetch)).status, 400);
  assert.equal((await claimLicense(request(), {}, noFetch)).status, 503);
  assert.equal((await claimLicense(new Request('https://clutterdock.com/api/license/claim'), env, noFetch)).status, 405);
  assert.equal((await claimLicense(request(), { ...env, LICENSE_RATE_LIMIT: { limit: async () => ({ success: false }) } }, noFetch)).status, 429);
});
test('merchant outages fail closed without returning its private response', async () => {
  for (const fetcher of [async () => { throw new Error('sensitive details'); }, async () => new Response('sensitive details', { status: 500 }), async () => new Response('bad json')]) {
    const response = await claimLicense(request(), env, fetcher);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('sensitive details'));
  }
});

// Run the actual Windows validator with a fixed, non-shipping secret and the
// packaged-app flag, so tests never read or print production license material.
const require = createRequire(import.meta.url);
const sandbox = { module: { exports: {} }, Buffer, console, AbortSignal,
  fetch: () => { throw new Error('unexpected network'); },
  require(name) {
    if (name === './license-secret') return { SECRET: env.LICENSE_SECRET };
    if (name === 'electron') return { app: { isPackaged: true } };
    return require(name);
  },
};
vm.runInNewContext(readFileSync(new URL('../../windows/src/license.js', import.meta.url), 'utf8'), sandbox);
const client = sandbox.module.exports;
test('Windows verifies merchant proof offline and keeps legacy keys', () => {
  assert.ok(client.validate(proof));
  assert.ok(client.validate(proof.toLowerCase()));
  assert.ok(!client.validate(proof.slice(0, -1) + '0'));
  assert.ok(!client.validate(proof + '-'));
  assert.ok(!client.validate('SDPRO-TEST-UNLOCK-2026'));
  assert.ok(client.validate(client.generateKey('AB12')));
});
test('Windows resolves receipts and rejects invalid server proofs', async () => {
  const result = await client.resolvePurchaseKey(receipt, async (url, options) => {
    assert.equal(url, 'https://clutterdock.com/api/license/claim');
    assert.equal(JSON.parse(options.body).licenseKey, receipt);
    return Response.json({ licenseKey: proof });
  });
  assert.equal(result, proof);
  assert.equal(await client.resolvePurchaseKey(proof), proof);
  await assert.rejects(client.resolvePurchaseKey(receipt, respond({ licenseKey: 'forged' })), /verified/);
  await assert.rejects(client.resolvePurchaseKey(receipt, async () => Response.json({ error: 'Try again later.' }, { status: 503 })), /Try again later/);
  await assert.rejects(client.resolvePurchaseKey('bad'), /receipt/);
});
