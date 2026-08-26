#!/usr/bin/env node
// Store behaviour tests, run without Electron via CLUTTERDOCK_DATA_DIR.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdock-test-'));
  process.env.CLUTTERDOCK_DATA_DIR = dir;
  return dir;
}

function freshStore() {
  delete require.cache[require.resolve('../src/store')];
  const { Store } = require('../src/store');
  return new Store();
}

// --- Defaults + persistence round-trip
let dir = freshDir();
let store = freshStore();
assert.ok(store.state.folders.length >= 2, 'default folders exist');
assert.ok(store.state.folders.some((f) => f.smartKind === 'recents'), 'Recents exists');

const added = store.addFolder('Coding', 'coding');
assert.strictEqual(added.ok, true, 'addFolder works');
const coding = store.state.folders.find((f) => f.name === 'Coding');
const tmpFile = path.join(dir, 'thing.txt');
fs.writeFileSync(tmpFile, 'x');
assert.strictEqual(store.addPaths([tmpFile], coding.id).added, 1, 'addPaths adds');
assert.strictEqual(store.addPaths([tmpFile], coding.id).added, 0, 'dedupe by kind|path');

store.flushPendingSave(); // writes are debounced; flush before re-reading from disk
let reloaded = freshStore();
assert.ok(reloaded.state.folders.some((f) => f.name === 'Coding'), 'persisted across reload');
assert.strictEqual(
  reloaded.state.folders.find((f) => f.name === 'Coding').items.length,
  1,
  'items persisted'
);

// --- Install register prefs (RON-507)
assert.match(store.prefs.installId, /^[0-9a-f-]{36}$/i, 'installId is a UUID');
assert.strictEqual(reloaded.prefs.installId, store.prefs.installId, 'installId stable across reloads');
assert.strictEqual(store.prefs.installRegisterChoice, '', 'register choice defaults to unset');
reloaded.updatePrefs({ installRegisterChoice: 'skipped' });
assert.strictEqual(
  freshStore().prefs.installRegisterChoice,
  'skipped',
  'register choice persists across reloads'
);

// --- Free folder cap (5 normal folders)
store = reloaded;
for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) store.addFolder(name);
const normals = store.state.folders.filter((f) => f.smartKind === 'none').length;
assert.strictEqual(normals, 5, `free cap enforced (got ${normals})`);

// --- URL scheme allowlist
assert.strictEqual(store.addURL('https://example.com', coding.id).added, 1, 'https ok');
assert.strictEqual(store.addURL('file:///C:/x.exe', coding.id).added, 0, 'file: rejected');
assert.strictEqual(store.addURL('ms-msdt:/id x', coding.id).added, 0, 'ms-msdt rejected');

// --- relocate onto own folder keeps position
const f2 = path.join(dir, 'second.txt');
fs.writeFileSync(f2, 'y');
store.addPaths([f2], coding.id);
const before = store.state.folders.find((f) => f.id === coding.id).items.map((i) => i.id);
store.relocateItem(before[0], coding.id);
const after = store.state.folders.find((f) => f.id === coding.id).items.map((i) => i.id);
assert.deepStrictEqual(after, before, 'same-folder relocate is a positional no-op');

// --- findItem resolves folder items, rejects junk
assert.ok(store.findItem(before[0]), 'findItem finds items');
assert.strictEqual(store.findItem('nope'), null, 'findItem rejects unknown');
assert.strictEqual(store.findItem({ evil: true }), null, 'findItem rejects non-strings');

// --- pack import: replace confirms via caller; store validates + backs up
const evilPack = JSON.stringify({
  folders: [
    {
      name: 'Evil',
      smartKind: 'none',
      items: [
        { kind: 'url', path: 'ms-msdt:/id PCWDiagnostic', name: 'help' },
        { kind: 'url', path: 'https://ok.example', name: 'ok' },
        { kind: 'nonsense', path: 'x' },
        { kind: 'file', path: 'C:/some/file.txt' },
      ],
    },
    { name: 'Recents', smartKind: 'recents', items: [] },
  ],
});
store.importPack(evilPack, false);
const evil = store.state.folders.find((f) => f.name === 'Evil');
assert.ok(evil, 'replace import applied');
assert.deepStrictEqual(
  evil.items.map((i) => i.kind).sort(),
  ['file', 'url'],
  'invalid kinds and non-http(s) urls dropped'
);
assert.ok(
  fs.existsSync(path.join(dir, 'ClutterDock', 'folders.json.pre-import.bak')),
  'pre-import backup written'
);
assert.ok(
  store.state.folders.some((f) => f.smartKind === 'recents'),
  'smart folders rebuilt locally, not imported'
);
assert.throws(() => store.importPack('{not json', false), /valid pack/, 'malformed pack throws');

// --- corrupt store file is backed up, not destroyed
dir = freshDir();
fs.mkdirSync(path.join(dir, 'ClutterDock'), { recursive: true });
fs.writeFileSync(path.join(dir, 'ClutterDock', 'folders.json'), '{corrupt!!!', 'utf8');
store = freshStore();
assert.ok(store.dataWarning, 'corruption surfaces a warning');
assert.ok(
  fs.existsSync(path.join(dir, 'ClutterDock', 'folders.json.corrupt.bak')),
  'corrupt file preserved'
);
assert.ok(store.state.folders.length >= 2, 'fresh defaults loaded');

// --- workspaces
store.addWorkspace('Work');
assert.strictEqual(store.state.workspaces.length, 2, 'workspace added');
const work = store.state.workspaces.find((w) => w.name === 'Work');
const firstNormal = store.state.folders.find((f) => f.smartKind === 'none');
store.toggleWorkspaceFolder(work.id, firstNormal.id);
store.selectWorkspace(work.id);
assert.deepStrictEqual(
  store.visibleFolders().map((f) => f.id),
  [firstNormal.id],
  'workspace filters visible folders'
);
store.deleteWorkspace(work.id);
assert.strictEqual(store.state.workspaces.length, 1, 'workspace deleted');
store.deleteWorkspace(store.state.workspaces[0].id);
assert.strictEqual(store.state.workspaces.length, 1, 'last workspace protected');

// --- password-protected stacks
dir = freshDir();
store = freshStore();
store.addFolder('Private');
const priv = store.state.folders.find((f) => f.name === 'Private');
const secretPath = path.join(dir, 'secret-notes.txt');
fs.writeFileSync(secretPath, 'x');
store.addPaths([secretPath], priv.id);
assert.strictEqual(store.lockFolder(priv.id, 'hunter2').ok, true, 'locks a stack');

let lockedFolder = store.state.folders.find((f) => f.id === priv.id);
assert.strictEqual(lockedFolder.items.length, 0, 'items cleared when locked');
assert.ok(lockedFolder.lock, 'lock payload stored');
assert.ok(store.isLocked(lockedFolder), 'reports locked');
assert.strictEqual(store.searchAll('secret-notes').length, 0, 'locked items excluded from search');
assert.ok(
  !fs.readFileSync(path.join(dir, 'ClutterDock', 'folders.json'), 'utf8').includes('secret-notes.txt'),
  'plaintext path absent from folders.json'
);

const reopened2 = freshStore();
assert.ok(store.isLocked(reopened2.state.folders.find((f) => f.id === priv.id)), 'locked after reload');
assert.strictEqual(reopened2.unlockFolder(priv.id, 'nope').ok, false, 'wrong password rejected');
assert.strictEqual(reopened2.unlockFolder(priv.id, 'hunter2').ok, true, 'unlocks with password');
assert.strictEqual(
  reopened2.state.folders.find((f) => f.id === priv.id).items.length,
  1,
  'items restored on unlock'
);
reopened2.relockFolder(priv.id);
assert.ok(store.isLocked(reopened2.state.folders.find((f) => f.id === priv.id)), 'relocks');

// --- Most Used smart stack exists alongside Recents
dir = freshDir();
store = freshStore();
assert.ok(store.state.folders.some((f) => f.smartKind === 'mostused'), 'Most Used smart stack created');
assert.strictEqual(
  store.state.folders.filter((f) => f.smartKind === 'mostused').length,
  1,
  'Most Used not duplicated'
);
store.flushPendingSave();
assert.ok(
  freshStore().state.folders.filter((f) => f.smartKind === 'mostused').length === 1,
  'Most Used stable across reloads'
);

// --- renameItem
const rnFolder = store.state.folders.find((f) => f.smartKind === 'none');
const rnFile = path.join(dir, 'to-rename.txt');
fs.writeFileSync(rnFile, 'x');
store.addPaths([rnFile], rnFolder.id);
const rnItem = rnFolder.items[0];
assert.strictEqual(store.renameItem(rnItem.id, rnFolder.id, '  Quarterly Report  '), true, 'renames');
assert.strictEqual(rnFolder.items[0].name, 'Quarterly Report', 'rename trims and applies');
assert.strictEqual(store.renameItem(rnItem.id, rnFolder.id, '   '), false, 'blank rename rejected');

// --- addPaths honors a friendly-name map
const nmFile = path.join(dir, 'MSTSC.EXE.txt');
fs.writeFileSync(nmFile, 'x');
store.addPaths([nmFile], rnFolder.id, { [nmFile]: 'Remote Desktop Connection' });
assert.ok(
  rnFolder.items.some((i) => i.name === 'Remote Desktop Connection'),
  'friendly name map applied'
);

// --- folder colors validated
store.setFolderColor(rnFolder.id, '#3B82F6');
assert.strictEqual(rnFolder.color, '#3B82F6', 'palette color stored');
store.setFolderColor(rnFolder.id, 'javascript:alert(1)');
assert.strictEqual(rnFolder.color, '#3B82F6', 'junk color rejected');
store.setFolderColor(rnFolder.id, '');
assert.strictEqual(rnFolder.color, undefined, 'color cleared');

// --- search ranks by frecency and matches subsequences
const sFolderRes = store.addFolder('SearchRank');
const sFolder = sFolderRes.folder;
const fA = path.join(dir, 'alpha-notes.txt');
const fB = path.join(dir, 'alpha-report.txt');
fs.writeFileSync(fA, 'x');
fs.writeFileSync(fB, 'x');
store.addPaths([fA, fB], sFolder.id);
const itemB = sFolder.items.find((i) => i.name.includes('report'));
for (let i = 0; i < 5; i++) store.recordLaunch(itemB); // itemB is opened often
const ranked = store.searchAll('alpha');
assert.strictEqual(ranked[0].item.id, itemB.id, 'frequently opened item ranks first');
const fuzzy = store.searchAll('alpharpt');
assert.ok(fuzzy.some((h) => h.item.id === itemB.id), 'subsequence match finds items');
assert.strictEqual(store.searchAll('zzqx').length, 0, 'no false fuzzy positives');

// --- CF_HDROP round-trip (Ctrl+C / Ctrl+V file transfer)
const { buildHDrop, parseHDrop } = require('../src/win-clipboard');
const hPaths = ['C:\\Users\\Test\\file one.txt', 'C:\\Файлы\\отчёт.xlsx'];
assert.deepStrictEqual(parseHDrop(buildHDrop(hPaths)), hPaths, 'CF_HDROP round-trips (incl. unicode)');
assert.deepStrictEqual(parseHDrop(Buffer.alloc(4)), [], 'truncated buffer tolerated');
assert.deepStrictEqual(parseHDrop(null), [], 'null buffer tolerated');
assert.strictEqual(buildHDrop([]), null, 'empty path list builds nothing');

console.log('store tests passed');
