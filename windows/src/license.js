const crypto = require('crypto');

/**
 * The product secret is generated at build time (scripts/write-license-secret.js →
 * src/license-secret.js, gitignored). Must match the Mac build's injected secret.
 * Dev fallback means real license keys will NOT validate in un-provisioned dev runs.
 */
let PRODUCT_SECRET = 'dev-secret-do-not-ship';
try {
  PRODUCT_SECRET = require('./license-secret').SECRET;
} catch (_) {
  console.warn('license: no license-secret.js — using dev secret (real keys will not validate)');
}

const TEST_KEY = 'SDPRO-TEST-UNLOCK-2026';

/** The dev/test unlock key only works outside packaged (shipped) builds. */
function testKeyAllowed() {
  try {
    const electron = require('electron');
    if (electron && electron.app) return !electron.app.isPackaged;
  } catch (_) {
    /* non-Electron context (CLI scripts) */
  }
  return true;
}

const FREE_MAX_FOLDERS = 5;
const FREE_MAX_ITEMS = 20;
const FREE_HISTORY = 15;
const PRO_HISTORY = 40;

function hmacHex(message) {
  return crypto.createHmac('sha256', PRODUCT_SECRET).update(message).digest('hex');
}

function validate(key) {
  if (!key || typeof key !== 'string') return false;
  const proof = key.trim().toUpperCase();
  if (proof.startsWith('CDPRO2-')) {
    const match = /^CDPRO2-([A-F0-9]{32})-([A-F0-9]{32})$/.exec(proof);
    if (!match) return false;
    return crypto.timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(hmacHex(`CDPRO2:${match[1]}`).slice(0, 32), 'hex'));
  }
  const compact = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact === 'SDPROTESTUNLOCK2026') return testKeyAllowed();
  // "SDPRO" (5) + 4 serial + 8 hex signature = 17
  if (!compact.startsWith('SDPRO') || compact.length !== 17) return false;
  const serial = compact.slice(5, 9);
  const sig = compact.slice(9, 17);
  const expected = hmacHex(serial).slice(0, 8).toUpperCase();
  return sig === expected;
}

function generateKey(serial) {
  const s = String(serial || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (s.length !== 4) return null;
  const sig = hmacHex(s).slice(0, 8).toUpperCase();
  return `SDPRO-${s}-${sig.slice(0, 4)}-${sig.slice(4, 8)}`;
}

function mask(key) {
  const u = String(key || '').toUpperCase();
  if (u.length < 10) return '••••';
  return u.slice(0, 10) + '••••';
}

async function resolvePurchaseKey(key, fetcher = fetch) {
  if (validate(key)) return key;
  const receipt = typeof key === 'string' ? key.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt)) {
    throw new Error('Paste the license key from your receipt.');
  }
  let response, payload;
  try {
    response = await fetcher('https://clutterdock.com/api/license/claim', {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ licenseKey: receipt }), signal: AbortSignal.timeout(15000),
    });
    payload = await response.json();
  } catch (_) {
    throw new Error('Connect to the internet to activate, then try again.');
  }
  if (!response.ok) throw new Error(payload.error || 'Activation is unavailable. Please try again later.');
  if (!validate(payload.licenseKey)) throw new Error('Activation could not be verified. Please try again later.');
  return payload.licenseKey;
}

function createFeatureGate(isPro) {
  return {
    isPro: !!isPro,
    freeMaxFolders: FREE_MAX_FOLDERS,
    freeMaxItems: FREE_MAX_ITEMS,
    historyLimit: isPro ? PRO_HISTORY : FREE_HISTORY,
    canUseGlobalSearch: !!isPro,
    canUseWorkspaces: !!isPro,
    canUseFolderHotkeys: !!isPro,
    canUseCustomFolderImages: !!isPro,
    canUseThemes: !!isPro,
    canExportPack: !!isPro,
    canAddFolder(normalCount) {
      return isPro || normalCount < FREE_MAX_FOLDERS;
    },
    canAddItem(count) {
      return isPro || count < FREE_MAX_ITEMS;
    },
    folderLimitMessage(current) {
      // `current` can exceed the cap (stacks made on Pro, then deactivated) —
      // "(7/5)" read like a bug, so describe the situation instead
      return current > FREE_MAX_FOLDERS
        ? `You have ${current} stacks — the Free plan includes ${FREE_MAX_FOLDERS}. Your stacks are safe; upgrade to Pro to add more.`
        : `The Free plan includes ${FREE_MAX_FOLDERS} stacks and you've used all of them. Upgrade to Pro for unlimited.`;
    },
    itemLimitMessage(current) {
      return current > FREE_MAX_ITEMS
        ? `This stack holds ${current} items — the Free plan includes ${FREE_MAX_ITEMS} per stack. Your items are safe; upgrade to Pro to add more.`
        : `The Free plan includes ${FREE_MAX_ITEMS} items per stack and this one is full. Upgrade to Pro for unlimited.`;
    },
  };
}

module.exports = {
  TEST_KEY,
  validate,
  resolvePurchaseKey,
  generateKey,
  mask,
  createFeatureGate,
  FREE_MAX_FOLDERS,
  FREE_MAX_ITEMS,
  PRO_HISTORY,
};
