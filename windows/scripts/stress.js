// ClutterDock stress harness — drives the real Electron app well past the
// polite e2e flows: 300 stacks, 2300+ items, churn, hostile input, crypto
// under load, restart at scale. Isolated temp profile; never touches real data.
const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_DIR = path.join(__dirname, '..');
const TEST_KEY = 'SDPRO-TEST-UNLOCK-2026';
const N_STACKS = 300;
const N_FILES = 2000;
const N_URLS = 300;
const N_CHURN = 400;
const N_TOGGLES = 50;
const N_VAULT = 1000;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdock-stress-'));
const fileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdock-stress-files-'));
const storeFile = () => path.join(userDataDir, 'ClutterDock', 'folders.json');

console.log('userDataDir:', userDataDir);
const files = [];
for (let i = 0; i < N_FILES; i++) {
  const p = path.join(fileDir, `stress-${String(i).padStart(4, '0')}.txt`);
  fs.writeFileSync(p, `stress file ${i}`);
  files.push(p);
}
// Distinct sentinel files that will only ever live in the locked Vault stack
const vaultMarkers = [];
for (let i = 0; i < 5; i++) {
  const p = path.join(fileDir, `vault-sentinel-zq${i}x-secret.txt`);
  fs.writeFileSync(p, 'sealed');
  vaultMarkers.push(p);
}

// Seeded LCG for reproducible churn
let seed = 1234567;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const results = [];
const metrics = [];
let app = null;
let page = null;
const t0 = Date.now();

async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}  (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push({ name, ok: false, detail: String(e && (e.message || e)).slice(0, 300) });
    console.log(`FAIL  ${name}  (${((Date.now() - start) / 1000).toFixed(1)}s)\n      ${String(e && (e.message || e)).slice(0, 300)}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function metric(name, value) { metrics.push({ name, value }); console.log(`  metric  ${name}: ${value}`); }

async function launch() {
  app = await electron.launch({
    // In plain Node, require('electron') resolves to the binary path
    executablePath: require('electron'),
    args: ['.', '--no-sandbox', `--user-data-dir=${userDataDir}`],
    cwd: APP_DIR,
    env: { ...process.env, CLUTTER_DOCK_NO_UPDATE: '1', CLUTTER_DOCK_NO_NET: '1' },
    timeout: 60000,
  });
  await app.firstWindow();
  page = null;
  for (let i = 0; i < 80; i++) {
    page = app.windows().find((p) => p.url().includes('index.html'));
    if (page) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!page) throw new Error('panel window never appeared');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(900);
}

const snap = () => page.evaluate(() => clutterDock.getSnapshot());
const rpc = (script, arg) => page.evaluate(script, arg);
const totalItems = (s) => s.state.folders.reduce((n, f) => n + (f.items || []).length, 0);

(async () => {
  await check('setup: launch, dismiss onboarding, activate Pro', async () => {
    await launch();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const lic = await rpc((k) => clutterDock.activateLicense(k), TEST_KEY);
    assert(lic.ok, `license: ${lic.error}`);
  });

  await check(`scale: create ${N_STACKS} stacks`, async () => {
    const start = Date.now();
    for (let i = 0; i < N_STACKS; i++) {
      const res = await rpc((n) => clutterDock.addFolder(n, 'work'), `Stk-${String(i).padStart(3, '0')}`);
      assert(res.ok, `stack ${i} failed: ${res.error || JSON.stringify(res)}`);
    }
    const secs = (Date.now() - start) / 1000;
    metric('stack adds/sec', (N_STACKS / secs).toFixed(1));
    const s = await snap();
    assert(s.state.folders.length >= N_STACKS + 2, `folders: ${s.state.folders.length}`);
  });

  await check(`scale: add ${N_FILES} file items in batches of 100`, async () => {
    const s = await snap();
    const targets = s.state.folders.filter((f) => f.name.startsWith('Stk-')).slice(0, 20);
    const start = Date.now();
    for (let b = 0; b < 20; b++) {
      const batch = files.slice(b * 100, b * 100 + 100);
      const res = await rpc(({ p, id }) => clutterDock.addPaths(p, id), { p: batch, id: targets[b].id });
      assert(!res || !res.limitMessage, `batch ${b} hit a limit while Pro`);
    }
    const secs = (Date.now() - start) / 1000;
    metric('file-item adds/sec', (N_FILES / secs).toFixed(0));
    const s2 = await snap();
    for (const t of targets) {
      const f = s2.state.folders.find((x) => x.id === t.id);
      assert(f.items.length === 100, `${t.name} has ${f.items.length} items`);
    }
  });

  await check(`scale: add ${N_URLS} URLs to one stack`, async () => {
    const s = await snap();
    const target = s.state.folders.find((f) => f.name === 'Stk-020');
    const start = Date.now();
    for (let i = 0; i < N_URLS; i++) {
      await rpc(({ u, id }) => clutterDock.addURL(u, id), { u: `https://stress-${i}.example.com/page`, id: target.id });
    }
    metric('url adds/sec', (N_URLS / ((Date.now() - start) / 1000)).toFixed(1));
    const s2 = await snap();
    const f = s2.state.folders.find((x) => x.id === target.id);
    assert(f.items.length === N_URLS, `urls stored: ${f.items.length}`);
  });

  await check('cost: snapshot latency and store size at scale', async () => {
    let bytes = 0;
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      const s = await snap();
      bytes = JSON.stringify(s).length;
    }
    metric('getSnapshot avg ms', ((Date.now() - start) / 5).toFixed(0));
    metric('snapshot JSON KB', (bytes / 1024).toFixed(0));
    metric('folders.json KB', (fs.statSync(storeFile()).size / 1024).toFixed(0));
  });

  await check('render: full reload with 300 stacks; actions still in view', async () => {
    const start = Date.now();
    await page.reload();
    await page.waitForSelector('#addFolderBtn', { timeout: 30000 });
    await page.waitForTimeout(800);
    metric('reload-to-ui ms', Date.now() - start);
    const box = await page.evaluate(() => {
      const el = document.getElementById('addFolderBtn');
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, w: window.innerWidth, h: r.height };
    });
    assert(box.right <= box.w && box.left >= 0 && box.h > 0 && box.h < 40,
      `actions out of view at 300 stacks: ${JSON.stringify(box)}`);
    const tabs = await rpc(() => document.querySelectorAll('.tab').length);
    metric('rendered tabs', tabs);
    assert(tabs >= N_STACKS, `tabs rendered: ${tabs}`);
  });

  await check('search: global search latency across ~2300 items', async () => {
    const start = Date.now();
    let broad = 0;
    for (let i = 0; i < 10; i++) broad = (await rpc(() => clutterDock.searchAll('stress'))).length;
    metric('searchAll broad avg ms', ((Date.now() - start) / 10).toFixed(0));
    metric('searchAll broad hits', broad);
    assert(broad >= N_FILES, `broad hits: ${broad}`);
    const narrow = await rpc(() => clutterDock.searchAll('stress-1234'));
    assert(narrow.length === 1, `narrow hits: ${narrow.length}`);
  });

  await check(`churn: ${N_CHURN} random reorder/nudge/relocate/rename ops conserve items`, async () => {
    let s = await snap();
    const before = totalItems(s);
    const start = Date.now();
    for (let i = 0; i < N_CHURN; i++) {
      s = i % 50 === 0 ? await snap() : s;
      const withItems = s.state.folders.filter((f) => (f.items || []).length > 0);
      const f = pick(withItems);
      const item = pick(f.items);
      const op = pick(['reorder', 'nudge', 'relocate', 'rename', 'sort']);
      if (op === 'reorder') {
        await rpc(({ i: it, to, fid }) => clutterDock.reorderItem(it, to, fid),
          { i: item.id, to: Math.floor(rnd() * f.items.length), fid: f.id });
      } else if (op === 'nudge') {
        await rpc(({ i: it, d, fid }) => clutterDock.nudgeItem(it, d, fid),
          { i: item.id, d: rnd() < 0.5 ? -1 : 1, fid: f.id });
      } else if (op === 'relocate') {
        const dst = pick(s.state.folders.filter((x) => x.id !== f.id && x.name.startsWith('Stk-')));
        await rpc(({ i: it, fid }) => clutterDock.relocateItem(it, fid), { i: item.id, fid: dst.id });
        s = await snap();
      } else if (op === 'rename') {
        await rpc(({ id, n }) => clutterDock.renameFolder(id, n), { id: f.id, n: `${f.name.slice(0, 12)}~${i}` });
        s = await snap();
      } else {
        await rpc(({ id, m }) => clutterDock.setFolderSort(id, m), { id: f.id, m: pick(['name', 'manual', 'kind']) });
      }
    }
    metric('churn ops/sec', (N_CHURN / ((Date.now() - start) / 1000)).toFixed(1));
    const s2 = await snap();
    assert(totalItems(s2) === before, `items ${before} -> ${totalItems(s2)}`);
    const ids = s2.state.folders.flatMap((f) => f.items.map((i) => i.id));
    assert(new Set(ids).size === ids.length, 'duplicate item ids after churn');
  });

  await check(`panel: ${N_TOGGLES} rapid hide/show cycles, stable afterwards`, async () => {
    for (let i = 0; i < N_TOGGLES; i++) {
      await rpc(() => clutterDock.hidePanel());
      await rpc(() => clutterDock.showPanel());
    }
    await page.waitForTimeout(500);
    const win = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html'));
      return w && !w.isDestroyed() ? { visible: w.isVisible(), bounds: w.getBounds() } : null;
    });
    assert(win && win.visible, 'panel wrong state after toggle storm');
    await rpc(() => clutterDock.showPanel()); // re-show while visible must not move it
    await page.waitForTimeout(300);
    const win2 = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html'));
      return { bounds: w.getBounds() };
    });
    assert(win2.bounds.x === win.bounds.x && win2.bounds.y === win.bounds.y, 'visible panel repositioned');
    const alive = await rpc(() => !!document.getElementById('addFolderBtn'));
    assert(alive, 'renderer dead after toggle storm');
  });

  await check('hostile: absurd folder names stored safely, no script execution', async () => {
    const s = await snap();
    const victims = s.state.folders.filter((f) => f.name.startsWith('Stk-2')).slice(0, 6);
    const names = [
      'A'.repeat(10000),
      '💾🧨🔥 ЯР\u200d🚀 من اليمين إلى اليسار',
      '<img src=x onerror="window.__pwned=1">',
      '<script>window.__pwned=1</script>',
      '../../../evil\\..\\path',
      'ctrl\u0001\u0002chars\tand\nnewlines',
    ];
    for (let i = 0; i < names.length; i++) {
      await rpc(({ id, n }) => clutterDock.renameFolder(id, n), { id: victims[i].id, n: names[i] });
    }
    await page.reload();
    await page.waitForSelector('#addFolderBtn', { timeout: 30000 });
    await page.waitForTimeout(800);
    const pwned = await rpc(() => window.__pwned);
    assert(!pwned, 'XSS: injected name executed in renderer');
    const s2 = await snap();
    assert(s2.state.folders.length === s.state.folders.length, 'folder count changed');
    const stored = s2.state.folders.find((f) => f.id === victims[2].id).name;
    metric('xss name stored as', JSON.stringify(stored).slice(0, 60));
    const longStored = s2.state.folders.find((f) => f.id === victims[0].id).name.length;
    metric('10k-char name stored length', longStored);
  });

  await check('hostile: giant and malformed URLs handled', async () => {
    const s = await snap();
    const target = s.state.folders.find((f) => f.name === 'Stk-021');
    const before = s.state.folders.find((f) => f.id === target.id).items.length;
    const giant = 'https://example.com/' + 'q'.repeat(8000);
    const cases = [giant, 'https://例え.テスト/ページ', 'data:text/html,<h1>hi</h1>', 'vbscript:msgbox(1)',
      'https://spa ce.com', 'ftp://old.example.com/file', String.fromCharCode(0) + 'https://nul.com'];
    for (const u of cases) {
      await rpc(({ u: url, id }) => clutterDock.addURL(url, id), { u, id: target.id });
    }
    const s2 = await snap();
    const items = s2.state.folders.find((f) => f.id === target.id).items;
    const paths = items.map((i) => i.path);
    assert(!paths.some((p) => p.startsWith('data:') || p.startsWith('vbscript:')), 'dangerous scheme accepted');
    metric('hostile URLs accepted', items.length - before);
    const alive = await snap();
    assert(alive.state.folders.length > 0, 'app dead after URL fuzz');
  });

  await check(`crypto: lock a ${N_VAULT + 5}-item stack, sealed on disk, unlock intact`, async () => {
    let res = await rpc((n) => clutterDock.addFolder(n, 'work'), 'Vault');
    assert(res.ok, 'vault create failed');
    let s = await snap();
    const vault = s.state.folders.find((f) => f.name === 'Vault');
    await rpc(({ p, id }) => clutterDock.addPaths(p, id), { p: files.slice(0, N_VAULT), id: vault.id });
    await rpc(({ p, id }) => clutterDock.addPaths(p, id), { p: vaultMarkers, id: vault.id });
    s = await snap();
    const count = s.state.folders.find((f) => f.id === vault.id).items.length;
    assert(count === N_VAULT + 5, `vault items: ${count}`);
    let start = Date.now();
    res = await rpc(({ id }) => clutterDock.lockFolder(id, 'correct-horse-battery'), { id: vault.id });
    assert(res.ok, `lock failed: ${res.error}`);
    metric('lock 1005 items ms', Date.now() - start);
    const disk = fs.readFileSync(storeFile(), 'utf8');
    assert(!disk.includes('vault-sentinel-zq'), 'sentinel plaintext on disk while locked');
    assert(disk.includes('"ct"'), 'no ciphertext field on disk');
    for (const bad of ['nope', '', 'correct-horse-battery ']) {
      const r = await rpc(({ id, pw }) => clutterDock.unlockFolder(id, pw), { id: vault.id, pw: bad });
      assert(!r.ok, `bad password "${bad}" accepted`);
    }
    start = Date.now();
    res = await rpc(({ id }) => clutterDock.unlockFolder(id, 'correct-horse-battery'), { id: vault.id });
    assert(res.ok, `unlock failed: ${res.error}`);
    metric('unlock 1005 items ms', Date.now() - start);
    s = await snap();
    assert(s.state.folders.find((f) => f.id === vault.id).items.length === N_VAULT + 5, 'items lost in crypto round-trip');
  });

  await check('crypto: 20 relock/unlock cycles keep integrity', async () => {
    const s = await snap();
    const vault = s.state.folders.find((f) => f.name === 'Vault');
    const start = Date.now();
    for (let i = 0; i < 20; i++) {
      let r = await rpc(({ id }) => clutterDock.relockFolder(id), { id: vault.id });
      assert(r === undefined || r.ok !== false, `relock ${i} failed`);
      r = await rpc(({ id, pw }) => clutterDock.unlockFolder(id, pw), { id: vault.id, pw: 'correct-horse-battery' });
      assert(r.ok, `unlock cycle ${i} failed: ${r.error}`);
    }
    metric('lock/unlock cycle avg ms', ((Date.now() - start) / 20).toFixed(0));
    const s2 = await snap();
    assert(s2.state.folders.find((f) => f.id === vault.id).items.length === N_VAULT + 5, 'cycle lost items');
  });

  await check('prefs: 40 junk payloads rejected, no prototype pollution', async () => {
    const junk = [
      { hotkey: 12345 }, { hotkey: null }, { theme: {} }, { evil: 'x'.repeat(100000) },
      JSON.parse('{"__proto__":{"cdPolluted":true}}'), { constructor: { prototype: { cdP2: 1 } } },
      { licenseKey: 'SDPRO-STOLEN' }, { hasCompletedOnboarding: 'yes' }, { launchAtLogin: 'true' },
      { nested: { deep: { deeper: [1, 2, 3] } } },
    ];
    for (let i = 0; i < 40; i++) {
      await rpc((p) => clutterDock.updatePrefs(p), junk[i % junk.length]).catch(() => {});
    }
    const polluted = await app.evaluate(() => ({}).cdPolluted || ({}).cdP2 || false);
    assert(!polluted, 'prototype pollution reached the main process');
    const rendererPolluted = await rpc(() => ({}).cdPolluted || ({}).cdP2 || false);
    assert(!rendererPolluted, 'prototype pollution in renderer');
    const s = await snap();
    assert(s.prefs.hotkey === 'CommandOrControl+Shift+D', `hotkey mutated: ${s.prefs.hotkey}`);
    assert(!('evil' in s.prefs) && !('nested' in s.prefs), 'junk key grafted into prefs');
    assert(s.license.isPro, 'license clobbered by prefs fuzz');
  });

  await check('memory: process footprint at full load', async () => {
    const appMetrics = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({
      type: m.type, mb: Math.round(m.memory.workingSetSize / 1024) })));
    for (const m of appMetrics) metric(`memory ${m.type} MB`, m.mb);
    const total = appMetrics.reduce((n, m) => n + m.mb, 0);
    metric('memory total MB', total);
    assert(total < 1500, `runaway memory: ${total}MB`);
  });

  await check('restart at scale: everything survives, vault stays sealed', async () => {
    let s = await snap();
    const before = { folders: s.state.folders.length, items: totalItems(s) };
    const vault = s.state.folders.find((f) => f.name === 'Vault');
    await rpc(({ id }) => clutterDock.relockFolder(id), { id: vault.id });
    await app.close();
    assert(!fs.existsSync(storeFile() + '.tmp'), 'orphan .tmp left after close');
    metric('folders.json final KB', (fs.statSync(storeFile()).size / 1024).toFixed(0));
    const start = Date.now();
    await launch();
    metric('cold start to UI ms (full store)', Date.now() - start);
    s = await snap();
    assert(s.state.folders.length === before.folders, `folders ${before.folders} -> ${s.state.folders.length}`);
    const v = s.state.folders.find((f) => f.name === 'Vault');
    assert(s.lockedFolderIDs.includes(v.id), 'vault unsealed after restart');
    assert(v.items.length === 0, 'sealed vault items visible after restart');
    const disk = fs.readFileSync(storeFile(), 'utf8');
    assert(!disk.includes('vault-sentinel-zq'), 'sentinel plaintext on disk after restart');
    const r = await rpc(({ id, pw }) => clutterDock.unlockFolder(id, pw), { id: v.id, pw: 'correct-horse-battery' });
    assert(r.ok, `post-restart unlock failed: ${r.error}`);
    s = await snap();
    assert(totalItems(s) === before.items, `items ${before.items} -> ${totalItems(s)}`);
  });

  await app.close().catch(() => {});

  const failed = results.filter((r) => !r.ok);
  console.log('\n---- METRICS ----');
  for (const m of metrics) console.log(`${m.name}: ${m.value}`);
  console.log(`\n${results.length - failed.length}/${results.length} stress checks passed in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(fileDir, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => {
  console.error('HARNESS CRASH:', e);
  try { await app.close(); } catch (_) {}
  process.exit(2);
});
