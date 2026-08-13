/**
 * Support paste for Settings → About. Never include a full license key.
 */

const MAX_ERRORS = 8;
const errors = [];

function recordError(message) {
  const ts = new Date().toISOString();
  errors.push(`${ts} ${String(message)}`);
  if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS);
}

function recentErrors() {
  return errors.slice();
}

function resetForTests() {
  errors.length = 0;
}

/**
 * @param {object} s
 * @returns {string}
 */
function render(s) {
  const lines = [
    'ClutterDock diagnostics',
    `version: ${s.appVersion || 'unknown'}`,
    `os: ${s.osVersion || 'unknown'}`,
    `arch: ${s.architecture || 'unknown'}`,
    `tier: ${s.tier || 'Free'}`,
    `key: ${s.maskedKey ? s.maskedKey : 'none'}`,
    `stacks: ${s.stackCount ?? 0}`,
    `items: ${s.itemCount ?? 0}`,
    `workspaces: ${s.workspaceCount ?? 0}`,
    `history: ${s.historyCount ?? 0}`,
    `dataDir: ${s.dataDirectory || ''}`,
    `corrupt.bak: ${s.corruptBackupExists ? 'yes' : 'no'}`,
    `pre-import.bak: ${s.preImportBackupExists ? 'yes' : 'no'}`,
    `updateCheck: ${s.lastUpdateCheck || 'never checked'}`,
    `hotkey: ${s.hotkeyStatus || 'unknown'}`,
  ];
  const recent = s.recentErrors || [];
  if (!recent.length) {
    lines.push('errors: none');
  } else {
    lines.push('errors:');
    for (const e of recent) lines.push(`- ${e}`);
  }
  return lines.join('\n');
}

function looksLikeFullKey(text) {
  return /SDPRO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/i.test(String(text));
}

module.exports = {
  recordError,
  recentErrors,
  resetForTests,
  render,
  looksLikeFullKey,
};
