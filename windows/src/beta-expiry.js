// Beta build expiration — the BUILD nags after this date; the app never stops
// working (the "free forever core" promise outranks build hygiene). Bump the
// date as part of each release until signed builds ship.

const BETA_EXPIRY = '2026-11-30'; // ISO date, UTC
const WARN_DAYS = 14;

/** 'ok' | 'warn' (inside the warning window) | 'expired' */
function expiryState(now = Date.now(), expiryISO = BETA_EXPIRY) {
  const expiry = Date.parse(`${expiryISO}T00:00:00Z`);
  if (!Number.isFinite(expiry)) return 'ok';
  if (now >= expiry) return 'expired';
  if (now >= expiry - WARN_DAYS * 86400000) return 'warn';
  return 'ok';
}

module.exports = { BETA_EXPIRY, WARN_DAYS, expiryState };
