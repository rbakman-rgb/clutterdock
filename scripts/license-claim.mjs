// Exchange a merchant receipt key once for an offline entitlement. No customer
// identity or raw keys are stored or logged. Legacy SDPRO keys remain valid.
const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encode = (value) => new TextEncoder().encode(value);
const hex = (value) => Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
const reply = (body, status = 200) => Response.json(body, {
  status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
});

async function readJSON(stream, maxBytes) {
  if (!stream) throw new Error("empty body");
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new Error("body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function claimLicense(request, env, fetcher = fetch) {
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
  if (!env.LICENSE_SECRET || !env.LEMON_STORE_ID || !env.LEMON_PRODUCT_IDS || !env.LICENSE_RATE_LIMIT) {
    return reply({ error: "Activation is temporarily unavailable. Please try again later." }, 503);
  }
  let input;
  try { input = await readJSON(request.body, 1024); }
  catch { return reply({ error: "Invalid activation request." }, 400); }
  const receipt = typeof input?.licenseKey === "string" ? input.licenseKey.trim().toLowerCase() : "";
  if (!KEY_PATTERN.test(receipt)) return reply({ error: "Paste the license key from your receipt." }, 400);
  try {
    const digest = hex(await crypto.subtle.digest("SHA-256", encode(receipt)));
    const { success } = await env.LICENSE_RATE_LIMIT.limit({ key: digest });
    if (!success) return reply({ error: "Too many attempts. Please wait a minute and try again." }, 429);
    const response = await fetcher("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST", redirect: "error",
      headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: receipt }), signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429 || response.status >= 500) throw new Error("merchant unavailable");
    const result = await readJSON(response.body, 16384);
    const license = result?.license_key;
    const meta = result?.meta;
    const products = env.LEMON_PRODUCT_IDS.split(",").map(s => s.trim()).filter(Boolean);
    // Test products have different IDs from live products. Only live product IDs
    // are configured, plus an explicit rejection if the API supplies test_mode.
    if (!response.ok || result?.valid !== true || result.test_mode === true || license?.test_mode === true || meta?.test_mode === true ||
        String(meta?.store_id) !== env.LEMON_STORE_ID || !products.includes(String(meta?.product_id)) ||
        !["active", "inactive"].includes(license?.status) || license?.key?.toLowerCase() !== receipt ||
        (license.expires_at != null && !(Date.parse(license.expires_at) > Date.now()))) {
      return reply({ error: "That key is not a valid ClutterDock Pro purchase. Check the key in your receipt." }, 403);
    }
    // 128-bit receipt fingerprint and 128-bit signature avoid the four-character
    // legacy serial's collision limit. Domain separation preserves old keys.
    const serial = digest.slice(0, 32);
    const signingKey = await crypto.subtle.importKey("raw", encode(env.LICENSE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = hex(await crypto.subtle.sign("HMAC", signingKey, encode(`CDPRO2:${serial}`))).slice(0, 32);
    return reply({ licenseKey: `CDPRO2-${serial}-${signature}` });
  } catch {
    return reply({ error: "Couldn’t reach the activation service. Please try again later." }, 503);
  }
}
