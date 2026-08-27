// Serves website/ as static assets; all hosts except the canonical one
// (clutterdock.app, www.*, *.workers.dev) 301 to https://clutterdock.com.
//
// RON-507 additions, all backed by the CLUTTERDOCK_STATS KV namespace:
//   GET  /dl/mac, /dl/win  — count one download event (platform + day, nothing
//                            else — no IP, no cookie), then 302 to the GitHub
//                            release asset.
//   POST /api/register     — optional, opt-in "count this install" ping from
//                            the apps: { email?, os, appVersion, installId }.
//   GET  /admin/stats      — aggregated JSON, requires Authorization: Bearer
//                            <ADMIN_TOKEN> (worker secret).
const CANONICAL_HOST = "clutterdock.com";

// Keep in sync with the Download buttons in website/index.html.
const DOWNLOAD_ASSETS = {
  mac: "https://github.com/rbakman-rgb/clutterdock/releases/download/v1.4.10/ClutterDock-1.4.10-mac.zip",
  win: "https://github.com/rbakman-rgb/clutterdock/releases/download/v1.4.10/ClutterDock-1.3.1-x64-setup.exe",
};
const RELEASES_LATEST = "https://github.com/rbakman-rgb/clutterdock/releases/latest";

const REGISTER_OS = new Set(["mac", "windows"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INSTALL_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function handleDownload(platform, request, env, ctx) {
  const target = DOWNLOAD_ASSETS[platform];
  if (!target) return Response.redirect(RELEASES_LATEST, 302);
  // One KV key per event: exact counts without read-modify-write races or
  // KV's one-write-per-second-per-key cap. Prefetches don't count.
  const purpose = request.headers.get("sec-purpose") || request.headers.get("purpose") || "";
  if (env.CLUTTERDOCK_STATS && request.method === "GET" && !purpose.includes("prefetch")) {
    const key = `dl:${platform}:${today()}:${crypto.randomUUID()}`;
    ctx.waitUntil(env.CLUTTERDOCK_STATS.put(key, "1"));
  }
  return Response.redirect(target, 302);
}

async function handleRegister(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!env.CLUTTERDOCK_STATS) return json({ ok: false, error: "not configured" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const installId = str(body?.installId);
  const os = str(body?.os).toLowerCase();
  const appVersion = str(body?.appVersion).slice(0, 32);
  const email = str(body?.email).slice(0, 254);
  if (!INSTALL_ID_RE.test(installId) || !REGISTER_OS.has(os)) {
    return json({ ok: false, error: "bad payload" }, 400);
  }
  if (email && !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "bad email" }, 400);
  }
  // Keyed by installId so re-registering (new version, added email) updates
  // one record instead of inflating the count.
  const key = `reg:${installId.toLowerCase()}`;
  const existing = await env.CLUTTERDOCK_STATS.get(key, "json");
  await env.CLUTTERDOCK_STATS.put(
    key,
    JSON.stringify({
      os,
      appVersion,
      email: email || existing?.email || "",
      firstSeen: existing?.firstSeen || today(),
      lastSeen: today(),
    })
  );
  return json({ ok: true });
}

async function listAll(kv, prefix, onKey) {
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const { name } of page.keys) await onKey(name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

async function handleAdminStats(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!env.ADMIN_TOKEN || !token || token !== env.ADMIN_TOKEN) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!env.CLUTTERDOCK_STATS) return json({ ok: false, error: "not configured" }, 503);

  const downloads = { mac: { total: 0, byDay: {} }, win: { total: 0, byDay: {} } };
  await listAll(env.CLUTTERDOCK_STATS, "dl:", (name) => {
    const [, platform, day] = name.split(":");
    const bucket = downloads[platform];
    if (!bucket) return;
    bucket.total += 1;
    bucket.byDay[day] = (bucket.byDay[day] || 0) + 1;
  });

  const installs = { total: 0, mac: 0, windows: 0, withEmail: 0, emails: [], records: [] };
  await listAll(env.CLUTTERDOCK_STATS, "reg:", async (name) => {
    const rec = await env.CLUTTERDOCK_STATS.get(name, "json");
    if (!rec) return;
    installs.total += 1;
    if (rec.os === "mac") installs.mac += 1;
    if (rec.os === "windows") installs.windows += 1;
    if (rec.email) {
      installs.withEmail += 1;
      installs.emails.push(rec.email);
    }
    installs.records.push({ installId: name.slice(4), ...rec });
  });
  installs.emails = [...new Set(installs.emails)];

  return json({ ok: true, generatedAt: new Date().toISOString(), downloads, installs });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname !== CANONICAL_HOST) {
      url.hostname = CANONICAL_HOST;
      url.protocol = "https:";
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/dl/mac" || url.pathname === "/dl/win") {
      return handleDownload(url.pathname.slice(4), request, env, ctx);
    }
    if (url.pathname === "/api/register") {
      return handleRegister(request, env);
    }
    if (url.pathname === "/admin/stats") {
      return handleAdminStats(request, env);
    }
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404 && (request.method === "GET" || request.method === "HEAD")) {
      const page = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
      if (page.ok) {
        return new Response(page.body, {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    }
    return res;
  },
};
