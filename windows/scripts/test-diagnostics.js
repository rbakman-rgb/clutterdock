const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { render, recordError, recentErrors, resetForTests, looksLikeFullKey } = require('../src/diagnostics');

resetForTests();
recordError('hotkey failed');
assert.ok(recentErrors()[0].includes('hotkey failed'), 'ring records errors');

const text = render({
  appVersion: '1.2.1',
  osVersion: 'Windows 10',
  architecture: 'x64',
  tier: 'Pro',
  maskedKey: 'SDPRO-A1B2••••',
  stackCount: 2,
  itemCount: 5,
  workspaceCount: 1,
  historyCount: 3,
  dataDirectory: path.join(os.tmpdir(), 'cd'),
  corruptBackupExists: false,
  preImportBackupExists: true,
  lastUpdateCheck: 'never checked',
  hotkeyStatus: 'ok',
  recentErrors: recentErrors(),
});

assert.ok(text.includes('version: 1.2.1'), 'renders version');
assert.ok(text.includes('key: SDPRO-A1B2••••'), 'renders masked key');
assert.ok(!looksLikeFullKey(text), 'paste does not contain a full SDPRO key');
assert.ok(text.includes('pre-import.bak: yes'), 'backup flags');
assert.ok(text.includes('hotkey failed'), 'includes ring');

// Build a report from a real store like main.js will
process.env.CLUTTERDOCK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cdock-diag-'));
delete require.cache[require.resolve('../src/store')];
const { Store, dataDir } = require('../src/store');
const store = new Store();
const snap = store.getSnapshot();
const live = render({
  appVersion: '1.2.1',
  osVersion: 'win32',
  architecture: 'x64',
  tier: snap.license.isPro ? 'Pro' : 'Free',
  maskedKey: snap.license.display,
  stackCount: snap.state.folders.length,
  itemCount: snap.state.folders.reduce((n, f) => n + (f.items || []).length, 0),
  workspaceCount: (snap.state.workspaces || []).length,
  historyCount: (store.history.entries || []).length,
  dataDirectory: dataDir(),
  corruptBackupExists: false,
  preImportBackupExists: false,
  lastUpdateCheck: 'never checked',
  hotkeyStatus: 'ok',
  recentErrors: [],
});
assert.ok(live.includes('tier: Free'), 'store-backed report is Free by default');
assert.ok(!looksLikeFullKey(live), 'store-backed report has no full key');
assert.strictEqual(snap.prefs.licenseKey, undefined, 'snapshot still strips licenseKey');

console.log('diagnostics tests passed');
