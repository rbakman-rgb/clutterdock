const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  ipcMain,
  dialog,
  shell,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { setupUpdater } = require('./updater');

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

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function asset(...parts) {
  return path.join(__dirname, '..', 'assets', ...parts);
}

function createPanel() {
  if (panel && !panel.isDestroyed()) return panel;

  panel = new BrowserWindow({
    width: 480,
    height: 520,
    show: false,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#f4f6fb',
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

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
}

function hidePanel() {
  if (panel && !panel.isDestroyed()) panel.hide();
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
  settingsWin.webContents.on('did-finish-load', () => {
    settingsWin.webContents.send('snapshot', store.getSnapshot());
  });
}

function createTray() {
  let iconPath = asset('tray-icon.png');
  if (!fs.existsSync(iconPath)) iconPath = asset('icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // 16x16 blue fallback
    image = nativeImage.createEmpty();
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

function registerHotkey() {
  globalShortcut.unregisterAll();
  const accel = store.prefs.hotkey || 'CommandOrControl+Shift+D';
  try {
    const ok = globalShortcut.register(accel, () => togglePanel());
    if (!ok) console.warn('Hotkey registration failed:', accel);
  } catch (e) {
    console.warn('Hotkey error', e);
  }
}

function wireIpc() {
  ipcMain.handle('get-snapshot', () => store.getSnapshot());

  ipcMain.handle('select-folder', (_e, id) => {
    store.selectFolder(id);
    return store.getSnapshot();
  });

  ipcMain.handle('add-folder', (_e, name, symbol) => {
    const result = store.addFolder(name, symbol);
    if (result && result.ok === false) {
      return { ...result, snapshot: store.getSnapshot() };
    }
    return store.getSnapshot();
  });

  ipcMain.handle('rename-folder', (_e, id, name) => {
    store.renameFolder(id, name);
    return store.getSnapshot();
  });

  ipcMain.handle('set-folder-symbol', (_e, id, symbol) => {
    store.setFolderSymbol(id, symbol);
    return store.getSnapshot();
  });

  ipcMain.handle('delete-folder', (_e, id) => {
    store.deleteFolder(id);
    return store.getSnapshot();
  });

  ipcMain.handle('set-folder-view', (_e, id, mode) => {
    store.setFolderView(id, mode);
    return store.getSnapshot();
  });

  ipcMain.handle('set-folder-sort', (_e, id, mode) => {
    store.setFolderSort(id, mode);
    return store.getSnapshot();
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
    const snap = store.getSnapshot();
    if (addResult?.hitLimit) {
      return { ...snap, _limitMessage: addResult.message };
    }
    return snap;
  });

  ipcMain.handle('add-paths', (_e, paths, folderID) => {
    const addResult = store.addPaths(paths || [], folderID);
    const snap = store.getSnapshot();
    if (addResult?.hitLimit) return { ...snap, _limitMessage: addResult.message };
    return snap;
  });

  ipcMain.handle('relocate-item', (_e, itemID, folderID) => {
    const result = store.relocateItem(itemID, folderID);
    const snap = store.getSnapshot();
    if (result?.hitLimit) return { ...snap, _limitMessage: result.message };
    return snap;
  });

  ipcMain.handle('add-url', (_e, url, folderID) => {
    const addResult = store.addURL(url, folderID);
    const snap = store.getSnapshot();
    if (addResult?.hitLimit) return { ...snap, _limitMessage: addResult.message };
    return snap;
  });

  ipcMain.handle('remove-item', (_e, itemID, folderID) => {
    store.removeItem(itemID, folderID);
    return store.getSnapshot();
  });

  ipcMain.handle('reorder-item', (_e, itemID, toIndex, folderID) => {
    store.reorderItem(itemID, toIndex, folderID);
    return store.getSnapshot();
  });

  ipcMain.handle('nudge-item', (_e, itemID, delta, folderID) => {
    store.nudgeItem(itemID, delta, folderID);
    return store.getSnapshot();
  });

  ipcMain.handle('open-item', async (_e, item) => {
    if (!item) return { ok: false };
    try {
      if (item.kind === 'url') {
        await shell.openExternal(item.path);
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

  ipcMain.handle('reveal-item', async (_e, item) => {
    if (!item || item.kind === 'url') {
      if (item?.path) await shell.openExternal(item.path);
      return;
    }
    if (fs.existsSync(item.path)) shell.showItemInFolder(item.path);
  });

  ipcMain.handle('search-all', (_e, query) => store.searchAll(query));

  ipcMain.handle('display-items', (_e, folderID) => {
    const folder = store.state.folders.find((f) => f.id === folderID) || store.selectedFolder();
    return store.displayItems(folder);
  });

  ipcMain.handle('update-prefs', (_e, partial) => {
    store.updatePrefs(partial || {});
    if (partial && partial.hotkey !== undefined) registerHotkey();
    if (partial && partial.launchAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: !!partial.launchAtLogin });
    }
    return store.getSnapshot();
  });

  ipcMain.handle('activate-license', (_e, key) => {
    const result = store.activateLicense(key);
    return { ...result, snapshot: store.getSnapshot() };
  });

  ipcMain.handle('deactivate-license', () => {
    store.deactivateLicense();
    return store.getSnapshot();
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
    if (result.canceled || !result.filePaths[0]) return store.getSnapshot();
    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    store.importPack(raw, !!merge);
    return store.getSnapshot();
  });

  ipcMain.handle('open-settings', () => {
    hidePanel();
    createSettings();
  });

  ipcMain.handle('hide-panel', () => hidePanel());
  ipcMain.handle('show-panel', () => showPanel());

  ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

  ipcMain.handle('get-item-icon', async (_e, itemPath) => {
    // Electron doesn't extract Windows icons easily cross-platform.
    // Renderer uses emoji/type glyphs; on Windows native icons can be added later.
    return null;
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
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showPanel();
  });

  app.whenReady().then(() => {
    store = new Store();
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
      store,
      onStatus: (msg) => {
        updateStatus = msg || '';
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
