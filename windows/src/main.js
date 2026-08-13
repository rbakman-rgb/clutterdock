const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  globalShortcut,
  ipcMain,
  dialog,
  shell,
  screen,
  clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { Store, dataDir } = require('./store');
const { setupUpdater } = require('./updater');
const { extractProtocolUrls, parseAction } = require('./url-scheme');
const { render: renderDiagnostics, recordError, recentErrors } = require('./diagnostics');

/** @type {BrowserWindow | null} */
let panel = null;
/** @type {BrowserWindow | null} */
let settingsWin = null;
/** @type {Tray | null} */
let tray = null;
/** @type {Store} */
let store;
/** @type {{ check: Function } | null} */
let updater = null;
let updateStatus = '';
let lastHotkeyOk = false;
/** @type {string[]} */
let pendingProtocolUrls = [];

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function asset(...parts) {
  return path.join(__dirname, '..', 'assets', ...parts);
}

/**
 * Renderer windows must never navigate away from the bundled HTML or open new
 * windows — a dropped/crafted link would otherwise load remote content with the
 * preload API attached.
 */
function hardenWebContents(contents) {
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Only hand web-style URLs to the OS; ms-msdt:, search-ms: etc. stay blocked. */
function safeOpenExternal(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    if (SAFE_EXTERNAL_PROTOCOLS.has(u.protocol)) {
      return shell.openExternal(u.toString());
    }
  } catch (_) {
    /* invalid URL */
  }
  console.warn('Blocked open-external for URL:', String(rawUrl).slice(0, 200));
  return Promise.resolve();
}

function createPanel() {
  if (panel && !panel.isDestroyed()) return panel;

  panel = new BrowserWindow({
    width: store?.prefs?.panelWidth || 480,
    height: store?.prefs?.panelHeight || 520,
    show: false,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10141d' : '#f4f6fb',
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  hardenWebContents(panel.webContents);
  panel.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  panel.on('blur', () => {
    // Don't hide while a native dialog is open
    if (panel && !panel.webContents.isDevToolsOpened()) {
      // Small delay so clicks on dialogs register
      setTimeout(() => {
        if (panel && !panel.isDestroyed() && !panel.isFocused() && !settingsWin?.isFocused()) {
          hidePanel();
        }
      }, 150);
    }
  });

  panel.on('closed', () => {
    panel = null;
  });

  // Remember the user's panel size across restarts
  let resizeTimer = null;
  panel.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (panel && !panel.isDestroyed()) {
        const [w, h] = panel.getSize();
        store.updatePrefs({ panelWidth: w, panelHeight: h });
      }
    }, 400);
  });

  return panel;
}

function positionPanel() {
  if (!panel) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { width, height } = panel.getBounds();
  const wa = display.workArea;
  let x = Math.round(cursor.x - width / 2);
  let y = Math.round(cursor.y - height - 16);
  // Prefer above taskbar if cursor near bottom
  if (cursor.y > wa.y + wa.height - 80) {
    y = Math.round(cursor.y - height - 12);
  } else if (y < wa.y + 8) {
    y = cursor.y + 16;
  }
  x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - width - 8);
  y = Math.min(Math.max(y, wa.y + 8), wa.y + wa.height - height - 8);
  panel.setPosition(x, y, false);
}

function showPanel() {
  const win = createPanel();
  positionPanel();
  win.show();
  win.focus();
  win.webContents.send('snapshot', store.getSnapshot());
  startRunningPoll();
}

function hidePanel() {
  if (panel && !panel.isDestroyed()) panel.hide();
  stopRunningPoll();
}

function togglePanel() {
  if (panel && panel.isVisible()) hidePanel();
  else showPanel();
}

function createSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'ClutterDock Settings',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  hardenWebContents(settingsWin.webContents);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
  const win = settingsWin;
  win.webContents.on('did-finish-load', () => {
    // Use the captured reference — settingsWin is nulled if closed before load finishes
    if (!win.isDestroyed()) win.webContents.send('snapshot', store.getSnapshot());
  });
}

function createTray() {
  let iconPath = asset('tray-icon.png');
  if (!fs.existsSync(iconPath)) iconPath = asset('icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // Solid 16x16 fallback — an empty tray image would make the app unreachable
    const px = Buffer.alloc(16 * 16 * 4);
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 246; // B
      px[i + 1] = 130; // G
      px[i + 2] = 59; // R
      px[i + 3] = 255; // A
    }
    image = nativeImage.createFromBuffer(px, { width: 16, height: 16 });
  }
  if (isMac) image = image.resize({ width: 18, height: 18 });
  else image = image.resize({ width: 16, height: 16 });

  tray = new Tray(image);
  tray.setToolTip('ClutterDock');
  tray.on('click', () => togglePanel());
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open Launcher', click: () => showPanel() },
      { label: 'Settings…', click: () => createSettings() },
      {
        label: 'Check for Updates…',
        click: () => updater?.check(true),
      },
      { type: 'separator' },
      {
        label: 'Buy Me a Coffee…',
        click: () => shell.openExternal('https://buymeacoffee.com/chidichidovsky'),
      },
      { type: 'separator' },
      { label: 'Quit ClutterDock', click: () => app.quit() },
    ]);
    tray.popUpContextMenu(menu);
  });
}

const DEFAULT_HOTKEY = 'CommandOrControl+Shift+D';

function registerHotkey() {
  globalShortcut.unregisterAll();
  const accel = store.prefs.hotkey || DEFAULT_HOTKEY;
  let ok = false;
  try {
    ok = globalShortcut.register(accel, () => togglePanel());
    if (!ok) {
      console.warn('Hotkey registration failed:', accel);
      recordError(`Hotkey registration failed: ${accel}`);
    }
  } catch (e) {
    console.warn('Hotkey error', e);
    recordError(`Hotkey error: ${e && e.message ? e.message : e}`);
  }
  lastHotkeyOk = ok;
  // Pro: Ctrl+Shift+1..9 jumps straight to the Nth visible stack (Mac parity)
  if (store.isPro) {
    for (let n = 1; n <= 9; n++) {
      try {
        globalShortcut.register(`CommandOrControl+Shift+${n}`, () => {
          const target = store.visibleFolders()[n - 1];
          if (target) {
            store.selectFolder(target.id);
            showPanel();
          }
        });
      } catch (_) {
        /* ignore individual failures */
      }
    }
  }
  return ok;
}

// Running-app indicators: poll GUI process paths only while the panel is visible
// (PowerShell spawn is too heavy to run continuously). Windows-only.
let runningPoll = null;

function refreshRunningPaths() {
  if (!isWin) return;
  const { execFile } = require('child_process');
  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object -ExpandProperty Path -Unique',
    ],
    { timeout: 5000, windowsHide: true },
    (err, stdout) => {
      if (err || !panel || panel.isDestroyed()) return;
      const paths = String(stdout || '')
        .split(/\r?\n/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      panel.webContents.send('running-paths', paths);
    }
  );
}

function startRunningPoll() {
  if (!isWin || runningPoll) return;
  refreshRunningPaths();
  runningPoll = setInterval(refreshRunningPaths, 10000);
}

function stopRunningPoll() {
  clearInterval(runningPoll);
  runningPoll = null;
}

// Every mutation IPC returns the same envelope: { ok, snapshot, error?, limitMessage? }.
// (The renderer previously had to guess between three different shapes.)
function okSnap(extra = {}) {
  return { ok: true, snapshot: store.getSnapshot(), ...extra };
}
function failSnap(error, extra = {}) {
  return { ok: false, error: error || 'Something went wrong', snapshot: store.getSnapshot(), ...extra };
}

function wireIpc() {
  ipcMain.handle('get-snapshot', () => store.getSnapshot());

  ipcMain.handle('select-folder', (_e, id) => {
    store.selectFolder(id);
    return okSnap();
  });

  ipcMain.handle('add-folder', (_e, name, symbol) => {
    const result = store.addFolder(name, symbol);
    if (result && result.ok === false) {
      return failSnap(result.message, { limitMessage: result.message });
    }
    return okSnap();
  });

  ipcMain.handle('rename-folder', (_e, id, name) => {
    store.renameFolder(id, name);
    return okSnap();
  });

  ipcMain.handle('set-folder-symbol', (_e, id, symbol) => {
    store.setFolderSymbol(id, symbol);
    return okSnap();
  });

  ipcMain.handle('delete-folder', (_e, id) => {
    store.deleteFolder(id);
    return okSnap();
  });

  ipcMain.handle('set-folder-view', (_e, id, mode) => {
    store.setFolderView(id, mode);
    return okSnap();
  });

  ipcMain.handle('set-folder-sort', (_e, id, mode) => {
    store.setFolderSort(id, mode);
    return okSnap();
  });

  ipcMain.handle('pick-and-add', async () => {
    hidePanel();
    const result = await dialog.showOpenDialog({
      title: 'Add to ClutterDock',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: isWin
        ? [
            { name: 'Apps & files', extensions: ['exe', 'lnk', 'bat', 'cmd', 'msi', '*'] },
            { name: 'All', extensions: ['*'] },
          ]
        : undefined,
    });
    let addResult = null;
    if (!result.canceled && result.filePaths.length) {
      addResult = store.addPaths(result.filePaths);
    }
    showPanel();
    return okSnap(addResult?.hitLimit ? { limitMessage: addResult.message } : {});
  });

  ipcMain.handle('add-paths', (_e, paths, folderID) => {
    const addResult = store.addPaths(paths || [], folderID);
    return okSnap(addResult?.hitLimit ? { limitMessage: addResult.message } : {});
  });

  ipcMain.handle('relocate-item', (_e, itemID, folderID) => {
    const result = store.relocateItem(itemID, folderID);
    return okSnap(result?.hitLimit ? { limitMessage: result.message } : {});
  });

  ipcMain.handle('add-url', (_e, url, folderID) => {
    const addResult = store.addURL(url, folderID);
    return okSnap(addResult?.hitLimit ? { limitMessage: addResult.message } : {});
  });

  ipcMain.handle('remove-item', (_e, itemID, folderID) => {
    store.removeItem(itemID, folderID);
    return okSnap();
  });

  ipcMain.handle('reorder-item', (_e, itemID, toIndex, folderID) => {
    store.reorderItem(itemID, toIndex, folderID);
    return okSnap();
  });

  ipcMain.handle('nudge-item', (_e, itemID, delta, folderID) => {
    store.nudgeItem(itemID, delta, folderID);
    return okSnap();
  });

  // Items are resolved by id in the store — the renderer must not be able to
  // launch arbitrary paths by sending a crafted item object.
  ipcMain.handle('open-item', async (_e, itemOrId) => {
    const item = store.findItem(typeof itemOrId === 'string' ? itemOrId : itemOrId?.id);
    if (!item) return { ok: false, error: 'Item not found' };
    try {
      if (item.kind === 'url') {
        await safeOpenExternal(item.path);
      } else if (fs.existsSync(item.path)) {
        const err = await shell.openPath(item.path);
        if (err) return { ok: false, error: err };
      } else {
        return { ok: false, error: 'Missing: ' + item.path };
      }
      store.recordLaunch(item);
      if (store.prefs.closeAfterLaunch) hidePanel();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('reveal-item', async (_e, itemOrId) => {
    const item = store.findItem(typeof itemOrId === 'string' ? itemOrId : itemOrId?.id);
    if (!item) return;
    if (item.kind === 'url') {
      await safeOpenExternal(item.path);
      return;
    }
    if (fs.existsSync(item.path)) shell.showItemInFolder(item.path);
  });

  ipcMain.handle('search-all', (_e, query) =>
    store.gate.canUseGlobalSearch ? store.searchAll(query) : []
  );

  // Only known prefs with the right types get through — the renderer must not be
  // able to graft arbitrary keys (licenseKey included) into the prefs file.
  const PREF_TYPES = {
    hotkey: 'string',
    closeAfterLaunch: 'boolean',
    hasCompletedOnboarding: 'boolean',
    showKeyboardHints: 'boolean',
    launchAtLogin: 'boolean',
    checkForUpdatesAutomatically: 'boolean',
  };

  ipcMain.handle('update-prefs', (_e, partial) => {
    const clean = {};
    for (const [key, type] of Object.entries(PREF_TYPES)) {
      if (partial && typeof partial[key] === type) clean[key] = partial[key];
    }
    store.updatePrefs(clean);
    let hotkeyError = null;
    if (clean.hotkey !== undefined) {
      // A typo'd accelerator would silently leave the app with no hotkey at all
      if (!registerHotkey()) {
        hotkeyError = `Couldn't register "${store.prefs.hotkey}" — restored ${DEFAULT_HOTKEY}.`;
        store.updatePrefs({ hotkey: DEFAULT_HOTKEY });
        registerHotkey();
      }
    }
    if (clean.launchAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: clean.launchAtLogin });
    }
    return okSnap(hotkeyError ? { hotkeyError } : {});
  });

  ipcMain.handle('activate-license', (_e, key) => {
    const result = store.activateLicense(key);
    if (!result.ok) return failSnap(result.error);
    registerHotkey(); // Pro folder hotkeys become available
    return okSnap({ display: result.display });
  });

  ipcMain.handle('deactivate-license', () => {
    store.deactivateLicense();
    registerHotkey();
    return okSnap();
  });

  ipcMain.handle('export-pack', async () => {
    if (!store.gate.canExportPack) {
      return { ok: false, error: 'Pack export requires ClutterDock Pro.' };
    }
    const result = await dialog.showSaveDialog({
      title: 'Export ClutterDock pack',
      defaultPath: 'ClutterDock-pack.clutterdock',
      filters: [{ name: 'ClutterDock pack', extensions: ['clutterdock', 'slavedock', 'json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    try {
      fs.writeFileSync(result.filePath, store.exportPack(), 'utf8');
      return { ok: true, path: result.filePath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('import-pack', async (_e, merge) => {
    const result = await dialog.showOpenDialog({
      title: 'Import ClutterDock pack',
      properties: ['openFile'],
      filters: [{ name: 'ClutterDock pack', extensions: ['clutterdock', 'slavedock', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, canceled: true, snapshot: store.getSnapshot() };
    }
    if (!merge) {
      const confirm = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Replace All Stacks', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: 'Replace all stacks with this pack?',
        detail:
          'Every current stack will be replaced by the pack contents. ' +
          'A backup of your current data is saved as folders.json.pre-import.bak in the data folder.',
      });
      if (confirm.response !== 0) {
        return { ok: false, canceled: true, snapshot: store.getSnapshot() };
      }
    }
    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf8');
      store.importPack(raw, !!merge);
      return { ok: true, snapshot: store.getSnapshot() };
    } catch (e) {
      return { ok: false, error: String(e.message || e), snapshot: store.getSnapshot() };
    }
  });

  ipcMain.handle('open-settings', () => {
    hidePanel();
    createSettings();
  });

  ipcMain.handle('hide-panel', () => hidePanel());
  ipcMain.handle('show-panel', () => showPanel());

  ipcMain.handle('open-external', (_e, url) => safeOpenExternal(url));

  ipcMain.handle('open-data-dir', () => shell.openPath(store.getSnapshot().dataDir));

  // Workspaces (Pro)
  const requirePro = (fn) => (e, ...args) => {
    if (!store.gate.canUseWorkspaces) {
      return failSnap('Workspaces are a ClutterDock Pro feature.', {
        limitMessage: 'Workspaces are a ClutterDock Pro feature.',
      });
    }
    return fn(e, ...args);
  };

  ipcMain.handle('select-workspace', requirePro((_e, id) => {
    store.selectWorkspace(id);
    return okSnap();
  }));

  ipcMain.handle('add-workspace', requirePro((_e, name) => {
    store.addWorkspace(name);
    return okSnap();
  }));

  ipcMain.handle('rename-workspace', requirePro((_e, id, name) => {
    store.renameWorkspace(id, name);
    return okSnap();
  }));

  ipcMain.handle('delete-workspace', requirePro((_e, id) => {
    store.deleteWorkspace(id);
    return okSnap();
  }));

  ipcMain.handle('toggle-workspace-folder', requirePro((_e, workspaceID, folderID) => {
    store.toggleWorkspaceFolder(workspaceID, folderID);
    return okSnap();
  }));

  // Password-protected stacks (Pro). Passwords cross IPC but are never persisted.
  ipcMain.handle('lock-folder', (_e, folderID, password) => {
    if (!store.gate.isPro) {
      return failSnap('Password-protected stacks are a Pro feature.', {
        limitMessage: 'Password-protected stacks are a Pro feature.',
      });
    }
    const res = store.lockFolder(folderID, String(password || ''));
    return res.ok ? okSnap() : failSnap(res.error);
  });

  ipcMain.handle('unlock-folder', (_e, folderID, password) => {
    const res = store.unlockFolder(folderID, String(password || ''));
    return res.ok ? okSnap() : failSnap(res.error);
  });

  ipcMain.handle('relock-folder', (_e, folderID) => {
    store.relockFolder(folderID);
    return okSnap();
  });

  ipcMain.handle('remove-folder-lock', (_e, folderID) => {
    store.removeLock(folderID);
    return okSnap();
  });

  // Custom folder images (Pro)
  const folderImageCache = new Map();

  ipcMain.handle('pick-folder-image', async (_e, folderID) => {
    if (!store.gate.canUseCustomFolderImages) {
      return failSnap('Custom stack images are a ClutterDock Pro feature.', {
        limitMessage: 'Custom stack images are a ClutterDock Pro feature.',
      });
    }
    const result = await dialog.showOpenDialog({
      title: 'Choose a stack image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, canceled: true, snapshot: store.getSnapshot() };
    }
    if (!store.setFolderImage(folderID, result.filePaths[0])) {
      return failSnap("Couldn't use that image.");
    }
    folderImageCache.clear();
    return okSnap();
  });

  ipcMain.handle('clear-folder-image', (_e, folderID) => {
    store.clearFolderImage(folderID);
    folderImageCache.clear();
    return okSnap();
  });

  ipcMain.handle('get-folder-image', (_e, folderID) => {
    const folder = store.state.folders.find((f) => f.id === folderID);
    const imgPath = folder?.customImage;
    if (!imgPath || !fs.existsSync(imgPath)) return null;
    if (folderImageCache.has(imgPath)) return folderImageCache.get(imgPath);
    let url = null;
    try {
      const img = nativeImage.createFromPath(imgPath);
      if (!img.isEmpty()) url = img.resize({ width: 32, height: 32 }).toDataURL();
    } catch (_) {
      /* ignore */
    }
    folderImageCache.set(imgPath, url);
    return url;
  });

  // Native file icons as data URLs (renderer falls back to emoji glyphs)
  const iconCache = new Map();
  ipcMain.handle('get-item-icon', async (_e, itemID) => {
    const item = store.findItem(itemID);
    if (!item || item.kind === 'url') return null;
    if (iconCache.has(item.path)) return iconCache.get(item.path);
    let url = null;
    try {
      if (fs.existsSync(item.path)) {
        const icon = await app.getFileIcon(item.path, { size: 'large' });
        if (icon && !icon.isEmpty()) url = icon.toDataURL();
      }
    } catch (_) {
      /* fall back to emoji */
    }
    iconCache.set(item.path, url);
    return url;
  });

  ipcMain.handle('check-for-updates', async (_e, interactive) => {
    if (!updater) {
      return { ok: false, error: 'Updater not ready' };
    }
    return updater.check(!!interactive);
  });

  ipcMain.handle('get-update-status', () => ({
    status: updateStatus,
    version: app.getVersion(),
  }));

  ipcMain.handle('copy-diagnostics', () => {
    const snap = store.getSnapshot();
    const dir = dataDir();
    const text = renderDiagnostics({
      appVersion: app.getVersion(),
      osVersion: `${process.platform} ${osRelease()}`,
      architecture: process.arch,
      tier: snap.license?.isPro ? 'Pro' : 'Free',
      maskedKey: snap.license?.display || '',
      stackCount: (snap.state.folders || []).length,
      itemCount: (snap.state.folders || []).reduce((n, f) => n + (f.items || []).length, 0),
      workspaceCount: (snap.state.workspaces || []).length,
      historyCount: (store.history.entries || []).length,
      dataDirectory: dir,
      corruptBackupExists: fs.existsSync(path.join(dir, 'folders.json.corrupt.bak')),
      preImportBackupExists: fs.existsSync(path.join(dir, 'folders.json.pre-import.bak')),
      lastUpdateCheck: updateStatus || 'never checked',
      hotkeyStatus: lastHotkeyOk ? `ok (${store.prefs.hotkey || DEFAULT_HOTKEY})` : 'failed',
      recentErrors: recentErrors(),
    });
    clipboard.writeText(text);
    return { ok: true };
  });
}

function osRelease() {
  try {
    return require('os').release();
  } catch (_) {
    return '';
  }
}

async function confirmAndAdd(action) {
  const lines = [];
  if (action.path) lines.push(`File: ${action.path}`);
  if (action.url) lines.push(`URL: ${action.url}`);
  if (action.rejectedUrl) lines.push('URL: (blocked — only http, https, mailto are allowed)');
  if (!action.path && !action.url) return;

  const parent =
    (settingsWin && !settingsWin.isDestroyed() && settingsWin) ||
    (panel && !panel.isDestroyed() && panel.isVisible() && panel) ||
    null;
  const opts = {
    type: 'warning',
    buttons: ['Add', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'Add to ClutterDock?',
    detail:
      'Another app or link asked ClutterDock to add:\n\n' + lines.join('\n'),
  };
  const result = parent
    ? await dialog.showMessageBox(parent, opts)
    : await dialog.showMessageBox(opts);
  if (result.response !== 0) return;

  let changed = false;
  if (action.path) {
    const addResult = store.addPaths([action.path]);
    changed = (addResult?.added || 0) > 0 || addResult?.hitLimit;
  }
  if (action.url) {
    const addResult = store.addURL(action.url);
    changed = (addResult?.added || 0) > 0 || addResult?.hitLimit || changed;
  }
  if (changed) showPanel();
}

async function applyProtocolAction(action) {
  switch (action.kind) {
    case 'open':
      if (action.folder) {
        const match = store.state.folders.find(
          (f) => f.name.toLowerCase() === String(action.folder).toLowerCase()
        );
        if (match) store.selectFolder(match.id);
      }
      showPanel();
      break;
    case 'settings':
      hidePanel();
      createSettings();
      break;
    case 'workspace':
      if (store.gate.canUseWorkspaces && action.workspace) {
        const ws = store.state.workspaces.find(
          (w) => w.name.toLowerCase() === String(action.workspace).toLowerCase()
        );
        if (ws) store.selectWorkspace(ws.id);
      }
      showPanel();
      break;
    case 'add':
      await confirmAndAdd(action);
      break;
    default:
      break;
  }
}

async function handleProtocolArgv(argv) {
  const urls = extractProtocolUrls(argv);
  if (!urls.length) return;
  if (!store) {
    pendingProtocolUrls.push(...urls);
    return;
  }
  for (const raw of urls) {
    await applyProtocolAction(parseAction(raw));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, commandLine) => {
    handleProtocolArgv(commandLine).then(() => {
      if (store && !extractProtocolUrls(commandLine).length) showPanel();
    });
  });

  app.whenReady().then(() => {
    // No app menu on Windows — the default one exposes devtools/reload in production.
    if (!isMac) Menu.setApplicationMenu(null);
    if (isWin) {
      app.setAsDefaultProtocolClient('clutterdock');
    }
    store = new Store();
    if (pendingProtocolUrls.length) {
      const queued = pendingProtocolUrls.splice(0);
      handleProtocolArgv(queued);
    }
    handleProtocolArgv(process.argv);
    // Sync login item from OS if possible
    try {
      const login = app.getLoginItemSettings();
      if (login.openAtLogin !== store.prefs.launchAtLogin) {
        store.updatePrefs({ launchAtLogin: login.openAtLogin });
      }
    } catch (_) {
      /* ignore */
    }

    wireIpc();
    createTray();
    createPanel();
    registerHotkey();

    updater = setupUpdater({
      onStatus: (msg) => {
        updateStatus = msg || '';
      },
      // Dialogs parent to a live window so they can't appear behind the app
      getParentWindow: () => {
        if (settingsWin && !settingsWin.isDestroyed()) return settingsWin;
        if (panel && !panel.isDestroyed() && panel.isVisible()) return panel;
        return null;
      },
    });

    // First run: show panel
    if (!store.prefs.hasCompletedOnboarding) {
      setTimeout(() => showPanel(), 400);
    }

    // Background update check (NSIS installs)
    if (store.prefs.checkForUpdatesAutomatically !== false && !process.env.CLUTTER_DOCK_NO_UPDATE) {
      setTimeout(() => {
        updater?.check(false).catch(() => {});
      }, 12000);
    }

    app.on('activate', () => showPanel());
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep running in the tray when panel/settings close
app.on('window-all-closed', (e) => {
  // Do not quit — tray stays alive until user chooses Quit
});
