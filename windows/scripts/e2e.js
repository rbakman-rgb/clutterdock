#!/usr/bin/env node
// End-to-end suite: drives the real Electron app (playwright-core) through
// every feature flow — onboarding, free limits, items, URLs, search, Pro
// unlock, workspaces, password stacks, prefs hardening, dialogs, persistence.
//
// Native OS dialogs can't be driven headless, so pick-and-add / import /
// export UI flows are covered by unit tests (test-store.js) instead.
//
// Run:  npm run e2e          (Linux/CI: xvfb-run -a npm run e2e)

const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_DIR = path.join(__dirname, '..');
const TEST_KEY = 'SDPRO-TEST-UNLOCK-2026';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdock-e2e-'));
const fileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdock-e2e-files-'));
const testFiles = [];
for (let i = 0; i < 25; i++) {
  const p = path.join(fileDir, `item-${String(i).padStart(2, '0')}.txt`);
  fs.writeFileSync(p, `test file ${i}`);
  testFiles.push(p);
}

const results = [];
let app = null;
let page = null;

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e.message || e).slice(0, 200) });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function launch() {
  app = await electron.launch({
    // In plain Node, require('electron') resolves to the binary path
    executablePath: require('electron'),
    args: ['.', '--no-sandbox', `--user-data-dir=${userDataDir}`],
    cwd: APP_DIR,
    env: { ...process.env, CLUTTER_DOCK_NO_UPDATE: '1' },
  });
  // On Windows the invisible taskbar-host window is created before the panel,
  // so firstWindow() would return the wrong page — select the panel by URL.
  await app.firstWindow();
  for (let i = 0; i < 60; i++) {
    page = app.windows().find((p) => p.url().includes('index.html'));
    if (page) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!page) throw new Error('panel window never appeared');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(900); // panel self-shows ~400ms after ready
}

const snap = () => page.evaluate(() => clutterDock.getSnapshot());
const rpc = (script, arg) => page.evaluate(script, arg);

(async () => {
  await launch();

  // ---- Launch & onboarding ----
  await check('launch: panel window appears with default stacks', async () => {
    const s = await snap();
    const names = s.state.folders.map((f) => f.name);
    assert(names.includes('Apps') && names.includes('Recents'), `folders: ${names}`);
    assert(s.state.folders.some((f) => f.smartKind === 'recents'), 'no smart Recents');
  });

  await check('onboarding: welcome card + register offer shown on first run', async () => {
    const visible = await rpc(() => !document.getElementById('overlay').hidden);
    const hasRegister = await rpc(() => !!document.getElementById('obCount'));
    assert(visible, 'overlay hidden on first run');
    assert(hasRegister, 'register block missing');
  });

  await check('onboarding: Esc dismisses and records skipped register choice', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const s = await snap();
    assert(s.prefs.hasCompletedOnboarding === true, 'onboarding not completed');
    assert(s.prefs.installRegisterChoice === 'skipped', `choice: ${s.prefs.installRegisterChoice}`);
    const hidden = await rpc(() => document.getElementById('overlay').hidden);
    assert(hidden, 'overlay still visible');
  });

  // ---- Stacks: free tier ----
  await check('free tier: 5 stacks allowed, 6th blocked with limit message', async () => {
    for (const n of ['S2', 'S3', 'S4', 'S5']) {
      const res = await rpc((name) => clutterDock.addFolder(name, 'work'), n);
      assert(res.ok, `adding ${n} failed: ${res.error}`);
    }
    const res = await rpc(() => clutterDock.addFolder('S6', 'games'));
    assert(res.ok === false && res.limitMessage, 'sixth stack was not blocked');
  });

  await check('stacks: rename, symbol change, delete', async () => {
    let s = await snap();
    const f = s.state.folders.find((x) => x.name === 'S5');
    await rpc((id) => clutterDock.renameFolder(id, 'Renamed'), f.id);
    await rpc((id) => clutterDock.setFolderSymbol(id, 'star'), f.id);
    s = await snap();
    const g = s.state.folders.find((x) => x.id === f.id);
    assert(g.name === 'Renamed' && g.symbol === 'star', `got ${g.name}/${g.symbol}`);
    await rpc((id) => clutterDock.deleteFolder(id), f.id);
    s = await snap();
    assert(!s.state.folders.some((x) => x.id === f.id), 'folder not deleted');
  });

  await check('tab strip: actions stay visible with many stacks', async () => {
    await rpc(async () => {
      const s = await clutterDock.getSnapshot();
      await clutterDock.selectFolder(s.state.folders[0].id);
    });
    await page.reload();
    await page.waitForTimeout(600);
    const box = await page.evaluate(() => {
      const el = document.getElementById('addFolderBtn');
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, w: window.innerWidth, h: r.height };
    });
    assert(box.right <= box.w && box.left >= 0 && box.h > 0 && box.h < 40,
      `actions out of view or wrapped: ${JSON.stringify(box)}`);
  });

  // ---- Items ----
  await check('items: add files, dedupe, skip nonexistent', async () => {
    const paths = [testFiles[0], testFiles[1], testFiles[0], path.join(fileDir, 'nope.txt')];
    await rpc((p) => clutterDock.addPaths(p), paths);
    const s = await snap();
    const items = s.state.folders[0].items;
    assert(items.length === 2, `expected 2 items, got ${items.length}`);
  });

  await check('free tier: 20 items per stack, 21st blocked', async () => {
    const res = await rpc((p) => clutterDock.addPaths(p), testFiles.slice(2));
    assert(res.limitMessage, 'no limit message at 20 items');
    const s = await snap();
    assert(s.state.folders[0].items.length === 20, `count ${s.state.folders[0].items.length}`);
  });

  await check('urls: https kept, bare domain upgraded, junk/file:/js: rejected', async () => {
    let s = await snap();
    const target = s.state.folders.find((f) => f.name === 'S2');
    await rpc(({ id }) => clutterDock.addURL('https://clutterdock.com', id), { id: target.id });
    await rpc(({ id }) => clutterDock.addURL('example.org', id), { id: target.id });
    await rpc(({ id }) => clutterDock.addURL('not a url', id), { id: target.id });
    await rpc(({ id }) => clutterDock.addURL('file:///etc/passwd', id), { id: target.id });
    await rpc(({ id }) => clutterDock.addURL('javascript:alert(1)', id), { id: target.id });
    await rpc(({ id }) => clutterDock.addURL('https://clutterdock.com', id), { id: target.id }); // dup
    s = await snap();
    const urls = s.state.folders.find((f) => f.id === target.id).items.map((i) => i.path);
    assert(urls.length === 2, `expected 2 urls, got: ${urls}`);
    assert(urls.includes('https://example.org'), 'bare domain not upgraded');
  });

  await check('items: remove, reorder, nudge', async () => {
    let s = await snap();
    const f = s.state.folders[0];
    const [a, b, c] = f.items;
    await rpc(({ i, fid }) => clutterDock.removeItem(i, fid), { i: c.id, fid: f.id });
    await rpc(({ i, fid }) => clutterDock.reorderItem(i, 1, fid), { i: a.id, fid: f.id });
    s = await snap();
    let items = s.state.folders[0].items;
    assert(!items.some((i) => i.id === c.id), 'remove failed');
    assert(items[1].id === a.id && items[0].id === b.id, 'reorder failed');
    await rpc(({ i, fid }) => clutterDock.nudgeItem(i, -1, fid), { i: a.id, fid: f.id });
    s = await snap();
    items = s.state.folders[0].items;
    assert(items[0].id === a.id, 'nudge failed');
  });

  await check('items: relocate between stacks; limit restores the item', async () => {
    // the remove/reorder check dropped folder 0 to 19 items — top it back up to the cap
    await rpc((p) => clutterDock.addPaths(p), [testFiles[21]]);
    let s = await snap();
    const src = s.state.folders.find((f) => f.name === 'S2');
    const dst = s.state.folders.find((f) => f.name === 'S3');
    const full = s.state.folders[0]; // at the 20-item free cap
    const item = src.items[0];
    let res = await rpc(({ i, fid }) => clutterDock.relocateItem(i, fid), { i: item.id, fid: full.id });
    assert(res.limitMessage, 'relocate into full stack not blocked');
    s = await snap();
    assert(s.state.folders.find((f) => f.id === src.id).items.some((i) => i.id === item.id),
      'item lost after blocked relocate');
    await rpc(({ i, fid }) => clutterDock.relocateItem(i, fid), { i: item.id, fid: dst.id });
    s = await snap();
    assert(s.state.folders.find((f) => f.id === dst.id).items.some((i) => i.id === item.id),
      'relocate failed');
  });

  // ---- Search ----
  await check('search: in-folder filter narrows the grid', async () => {
    await rpc(async () => {
      const s = await clutterDock.getSnapshot();
      await clutterDock.selectFolder(s.state.folders[0].id);
    });
    await page.reload();
    await page.waitForTimeout(600);
    await page.fill('#search', 'item-05');
    await page.waitForTimeout(400);
    const count = await rpc(() => document.querySelectorAll('.tile, .list-row').length);
    assert(count === 1, `expected 1 hit, got ${count}`);
    await page.fill('#search', '');
    await page.waitForTimeout(300);
  });

  await check('search: global search gated behind Pro for free tier', async () => {
    const hits = await rpc(() => clutterDock.searchAll('item'));
    assert(Array.isArray(hits) && hits.length === 0, 'free tier got global hits');
    await page.click('#searchAll');
    await page.waitForTimeout(300);
    const modalText = await rpc(() => document.getElementById('modal').textContent || '');
    assert(/Pro/.test(modalText), 'no Pro upsell for global search');
    await page.keyboard.press('Escape');
  });

  // ---- Pro unlock ----
  await check('license: invalid key rejected, dev test key activates Pro', async () => {
    const bad = await rpc(() => clutterDock.activateLicense('SDPRO-XXXX-YYYY-ZZZZ'));
    assert(bad.ok === false, 'garbage key accepted');
    const good = await rpc((k) => clutterDock.activateLicense(k), TEST_KEY);
    assert(good.ok, `test key rejected: ${good.error}`);
    const s = await snap();
    assert(s.gate.isPro && s.license.isPro, 'gate not Pro after activation');
    assert(!('licenseKey' in s.prefs) || s.prefs.licenseKey === undefined, 'raw key leaked in snapshot');
  });

  await check('pro: unlimited stacks and items, global search works', async () => {
    const res = await rpc(() => clutterDock.addFolder('S6', 'games'));
    assert(res.ok, 'Pro cannot add 6th stack');
    const add = await rpc((p) => clutterDock.addPaths(p, null), [testFiles[20]]);
    assert(!add.limitMessage, 'Pro still item-limited');
    const hits = await rpc(() => clutterDock.searchAll('item-0'));
    assert(hits.length > 0, 'Pro global search returned nothing');
  });

  // ---- Workspaces ----
  await check('workspaces: add, scope folders, switch, chip bar renders', async () => {
    let s = await snap();
    const coding = s.state.folders.find((f) => f.name === 'S2');
    await rpc(() => clutterDock.addWorkspace('Focus'));
    s = await snap();
    const ws = s.state.workspaces.find((w) => w.name === 'Focus');
    assert(ws, 'workspace missing');
    await rpc(({ w, f }) => clutterDock.toggleWorkspaceFolder(w, f), { w: ws.id, f: coding.id });
    await rpc((w) => clutterDock.selectWorkspace(w), ws.id);
    s = await snap();
    assert(s.visibleFolderIDs.length === 1 && s.visibleFolderIDs[0] === coding.id,
      `visible: ${s.visibleFolderIDs.length}`);
    await page.reload();
    await page.waitForTimeout(600);
    const chips = await rpc(() => document.querySelectorAll('.ws-chip').length);
    assert(chips === 2, `expected 2 chips, got ${chips}`);
    // back to All for the rest of the suite
    await rpc(async () => {
      const x = await clutterDock.getSnapshot();
      await clutterDock.selectWorkspace(x.state.workspaces[0].id);
    });
  });

  // ---- Password stacks ----
  await check('lock: stack seals, plaintext leaves folders.json on disk', async () => {
    let s = await snap();
    const f = s.state.folders.find((x) => x.name === 'S3');
    const marker = f.items[0]?.path;
    assert(marker, 'S3 has no item to seal');
    const res = await rpc(({ id }) => clutterDock.lockFolder(id, 'hunter2'), { id: f.id });
    assert(res.ok, `lock failed: ${res.error}`);
    s = await snap();
    assert(s.lockedFolderIDs.includes(f.id), 'not in lockedFolderIDs');
    assert(s.state.folders.find((x) => x.id === f.id).items.length === 0, 'items still visible');
    const disk = fs.readFileSync(path.join(userDataDir, 'ClutterDock', 'folders.json'), 'utf8');
    assert(!disk.includes(marker), 'plaintext item path on disk while locked');
    assert(disk.includes('"ct"'), 'no ciphertext on disk');
  });

  await check('lock: wrong password fails via in-panel dialog (no alert)', async () => {
    const s = await snap();
    const f = s.state.folders.find((x) => x.name === 'S3');
    const res = await rpc(({ id }) => clutterDock.unlockFolder(id, 'wrong'), { id: f.id });
    assert(res.ok === false && res.error, 'wrong password accepted');
  });

  await check('lock: unlock restores items, relock seals, removeLock clears', async () => {
    let s = await snap();
    const f = s.state.folders.find((x) => x.name === 'S3');
    let res = await rpc(({ id }) => clutterDock.unlockFolder(id, 'hunter2'), { id: f.id });
    assert(res.ok, `unlock failed: ${res.error}`);
    s = await snap();
    assert(s.state.folders.find((x) => x.id === f.id).items.length > 0, 'items not restored');
    await rpc(({ id }) => clutterDock.relockFolder(id), { id: f.id });
    s = await snap();
    assert(s.lockedFolderIDs.includes(f.id), 'relock failed');
    await rpc(({ id }) => clutterDock.unlockFolder(id, 'hunter2'), { id: f.id });
    await rpc(({ id }) => clutterDock.removeFolderLock(id), { id: f.id });
    s = await snap();
    const g = s.state.folders.find((x) => x.id === f.id);
    assert(!g.lock && !s.lockedFolderIDs.includes(f.id), 'lock not removed');
  });

  await check('lock: locked stack does not leak into global search', async () => {
    const s = await snap();
    const f = s.state.folders.find((x) => x.name === 'S2');
    await rpc(({ id }) => clutterDock.lockFolder(id, 'pw'), { id: f.id });
    const hits = await rpc(() => clutterDock.searchAll('clutterdock.com'));
    assert(!hits.some((h) => h.folderID === f.id), 'locked stack leaked via search');
    await rpc(({ id }) => clutterDock.unlockFolder(id, 'pw'), { id: f.id });
    await rpc(({ id }) => clutterDock.removeFolderLock(id), { id: f.id });
  });

  // ---- Prefs hardening ----
  await check('prefs: invalid hotkey falls back to default with an error', async () => {
    const res = await rpc(() => clutterDock.updatePrefs({ hotkey: 'NotARealKeyCombo!!!' }));
    assert(res.hotkeyError, 'no hotkeyError for junk accelerator');
    const s = await snap();
    assert(s.prefs.hotkey === 'CommandOrControl+Shift+D', `hotkey now: ${s.prefs.hotkey}`);
  });

  await check('prefs: unknown keys and register-choice grafts are rejected', async () => {
    await rpc(() => clutterDock.updatePrefs({ licenseKey: 'SDPRO-EVIL', evil: true }));
    await rpc(() => clutterDock.updatePrefs({ installRegisterChoice: 'registered' }));
    const s = await snap();
    assert(s.license.isPro, 'license clobbered via updatePrefs');
    assert(s.prefs.installRegisterChoice === 'skipped', `choice: ${s.prefs.installRegisterChoice}`);
  });

  // ---- Renderer dialogs ----
  await check('ui: new-stack dialog creates a stack end-to-end', async () => {
    await page.reload();
    await page.waitForTimeout(600);
    await page.click('#addFolderBtn');
    await page.fill('#dlgInput', 'DialogStack');
    await page.click('#dlgOk');
    await page.waitForTimeout(400);
    const s = await snap();
    assert(s.state.folders.some((f) => f.name === 'DialogStack'), 'stack not created via dialog');
  });

  await check('ui: folder context menu switches grid/list view', async () => {
    const s = await snap();
    const f = s.state.folders.find((x) => x.name === 'DialogStack');
    await page.evaluate((name) => {
      const tab = [...document.querySelectorAll('.tab')].find((t) => t.textContent.includes(name));
      tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 40 }));
    }, 'DialogStack');
    await page.waitForTimeout(200);
    await page.click('#ctx [data-a="list"]');
    await page.waitForTimeout(300);
    const s2 = await snap();
    assert(s2.state.folders.find((x) => x.id === f.id).viewMode === 'list', 'view not switched');
  });

  await check('ui: help dialog opens and closes', async () => {
    await page.click('#helpBtn');
    await page.waitForTimeout(200);
    const text = await rpc(() => document.getElementById('modal').textContent);
    assert(/Keyboard shortcuts/.test(text), 'help dialog missing');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const hidden = await rpc(() => document.getElementById('modal').hidden);
    assert(hidden, 'help dialog did not close');
  });

  // ---- Window behavior ----
  await check('panel: hide/show IPC round-trips; no reposition while visible', async () => {
    const win = () => app.evaluate(({ BrowserWindow }) => {
      // Match by URL — on Windows the taskbar host shares the 'ClutterDock' title
      const w = BrowserWindow.getAllWindows().find((x) =>
        x.webContents.getURL().includes('index.html'));
      return w ? { visible: w.isVisible(), bounds: w.getBounds() } : null;
    });
    await rpc(() => clutterDock.showPanel());
    await page.waitForTimeout(300);
    const a = await win();
    assert(a && a.visible, 'panel not visible after showPanel');
    await rpc(() => clutterDock.showPanel()); // second show while visible
    await page.waitForTimeout(300);
    const b = await win();
    assert(b.bounds.x === a.bounds.x && b.bounds.y === a.bounds.y,
      'visible panel was repositioned on re-show');
    await rpc(() => clutterDock.hidePanel());
    await page.waitForTimeout(300);
    const c = await win();
    assert(c && !c.visible, 'panel still visible after hidePanel');
    await rpc(() => clutterDock.showPanel());
    await page.waitForTimeout(300);
  });

  await check('updates: status endpoint reports app version', async () => {
    const st = await rpc(() => clutterDock.getUpdateStatus());
    assert(/^\d+\.\d+\.\d+$/.test(st.version), `version: ${st.version}`);
  });

  // ---- Settings window ----
  await check('settings: opens, prefs toggle persists, Pro status shown', async () => {
    const settingsPromise = app.waitForEvent('window', { timeout: 8000 });
    await rpc(() => clutterDock.openSettings());
    const sw = await settingsPromise;
    await sw.waitForLoadState('domcontentloaded');
    await sw.waitForTimeout(700);
    const proText = await sw.evaluate(() => document.getElementById('proStatus').textContent);
    assert(/Pro/.test(proText), `pro status: ${proText}`);
    await sw.click('#closeAfter');
    await sw.waitForTimeout(400);
    const s = await snap();
    assert(s.prefs.closeAfterLaunch === false, 'toggle did not persist');
    await sw.click('#closeAfter'); // restore
    await sw.waitForTimeout(300);
    const rows = await sw.evaluate(() => document.querySelectorAll('.ws-row').length);
    assert(rows >= 1, 'workspace rows missing for Pro');
    await sw.close();
  });

  // ---- License deactivation ----
  await check('license: deactivate returns app to free gates', async () => {
    await rpc(() => clutterDock.deactivateLicense());
    const s = await snap();
    assert(!s.gate.isPro, 'still Pro after deactivate');
    const res = await rpc(() => clutterDock.addFolder('TooMany', 'work'));
    assert(res.ok === false && res.limitMessage, 'free folder limit not restored');
  });

  // ---- Persistence across restart ----
  await check('restart: stacks, items, prefs survive; onboarding stays done', async () => {
    const before = await snap();
    await app.close();
    await launch();
    const after = await snap();
    assert(after.prefs.hasCompletedOnboarding, 'onboarding reset after restart');
    const overlayHidden = await rpc(() => document.getElementById('overlay').hidden);
    assert(overlayHidden, 'welcome card shown again after restart');
    const names = (s) => s.state.folders.map((f) => f.name).sort().join(',');
    assert(names(after) === names(before), `folders differ: ${names(after)} vs ${names(before)}`);
    const count = (s) => s.state.folders.reduce((n, f) => n + (f.items || []).length, 0);
    assert(count(after) === count(before), `items differ: ${count(after)} vs ${count(before)}`);
  });

  await app.close().catch(() => {});

  // ---- Report ----
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(fileDir, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => {
  console.error('E2E harness crashed:', e);
  try { if (app) await app.close(); } catch (_) { /* ignore */ }
  process.exit(2);
});
