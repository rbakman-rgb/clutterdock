/**
 * Parse clutterdock:// URLs. Windows delivers them as argv entries, not open-url.
 * Do not accept the legacy slavedock:// scheme.
 */

const SAFE_ADD_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function extractProtocolUrls(argv) {
  return (argv || [])
    .map((a) => String(a))
    .filter((a) => /^clutterdock:\/\//i.test(a));
}

function isSafeAddUrl(urlString) {
  if (!urlString) return false;
  try {
    const u = new URL(String(urlString));
    return SAFE_ADD_PROTOCOLS.has(u.protocol);
  } catch (_) {
    return false;
  }
}

/**
 * @returns {{ kind: 'open'|'settings'|'add'|'workspace'|'ignore', folder?: string|null, path?: string|null, url?: string|null, workspace?: string|null }}
 */
function parseAction(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch (_) {
    return { kind: 'ignore' };
  }
  if (u.protocol.toLowerCase() !== 'clutterdock:') return { kind: 'ignore' };

  const host = (u.hostname || u.pathname.replace(/^\/+/, '') || '').toLowerCase();
  const q = u.searchParams;

  switch (host) {
    case 'open':
    case '':
      return { kind: 'open', folder: q.get('folder') };
    case 'settings':
      return { kind: 'settings' };
    case 'add': {
      const path = q.get('path');
      const url = q.get('url');
      return {
        kind: 'add',
        path: path || null,
        url: url && isSafeAddUrl(url) ? url : url ? null : null,
        rejectedUrl: url && !isSafeAddUrl(url) ? true : false,
      };
    }
    case 'workspace':
      return { kind: 'workspace', workspace: q.get('name') };
    default:
      return { kind: 'ignore' };
  }
}

module.exports = {
  extractProtocolUrls,
  isSafeAddUrl,
  parseAction,
};
