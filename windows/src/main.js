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
const os = require('os');
const { execFile, spawn } = require('child_process');
const { createHash } = require('crypto');
const { Store, dataDir, setDataDirPointer } = require('./store');
const { setupUpdater } = require('./updater');
const { buildHDrop, parseHDrop } = require('./win-clipboard');

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
const APP_USER_MODEL_ID = 'com.ronald.ClutterDock';

if (isWin) {
  // Must match the Start Menu / taskbar shortcut or Windows treats each
  // launch as a new unnamed app (can't pin, AV looks at a Temp path).
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

let taskbarHost = null;
let isQuitting = false;
let suppressTaskbarFocus = false;
let lastPanelHideAt = 0;
// A drag hovering the panel must never trigger the blur auto-hide — the drop
// target would vanish mid-drag (renderer reports via 'set-drag-active').
let panelDragActiveUntil = 0;

// Acrylic needs Windows 11 22H2+ (build 22621)
const winBuild = isWin ? parseInt(os.release().split('.')[2] || '0', 10) : 0;
const acrylicSupported = isWin && winBuild >= 22621;

// Native dialogs steal focus from the always-on-top panel. Without a guard the
// panel's blur handler hides it mid-dialog; without a parent the dialog can
// open *behind* the panel. Every dialog.show* call must go through here.
let nativeDialogDepth = 0;

function dialogParent() {
  if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isFocused()) return settingsWin;
  if (panel && !panel.isDestroyed() && panel.isVisible()) return panel;
  if (settingsWin && !settingsWin.isDestroyed()) return settingsWin;
  return null;
}

async function showNativeDialog(fn, opts) {
  nativeDialogDepth += 1;
  const parent = dialogParent();
  try {
    return await (parent ? fn.call(dialog, parent, opts) : fn.call(dialog, opts));
  } finally {
    nativeDialogDepth -= 1;
    if (parent && !parent.isDestroyed() && parent.isVisible()) parent.focus();
  }
}

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

  const useAcrylic = acrylicSupported && store?.prefs?.transparencyEffects !== false;
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
    // Win11 22H2+: native acrylic like the OS's own flyouts (clock, quick settings)
    ...(useAcrylic ? { backgroundMaterial: 'acrylic' } : {}),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10141d' : '#f4f6fb',
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (store) {
    store.runtimeInfo = { ...(store.runtimeInfo || {}), acrylic: useAcrylic, acrylicSupported };
  }

  hardenWebContents(panel.webContents);
  panel.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  panel.on('blur', () => {
    // Don't hide while a native dialog is open, the user pinned the panel
    // open, or a drag from Explorer is in flight (starting that drag blurs us)
    if (
      panel &&
      !panel.webContents.isDevToolsOpened() &&
      nativeDialogDepth === 0 &&
      !store?.prefs?.keepOpen &&
      Date.now() > panelDragActiveUntil
    ) {
      // Small delay so clicks on dialogs register
      setTimeout(() => {
        if (
          panel &&
          !panel.isDestroyed() &&
          !panel.isFocused() &&
          !settingsWin?.isFocused() &&
          nativeDialogDepth === 0 &&
          !store?.prefs?.keepOpen &&
          Date.now() > panelDragActiveUntil
        ) {
          hidePanel();
        }
      }, 150);
    }
  });

  panel.on('closed', () => {
    panel = null;
  });

  // Remember where the user drags the panel (placement mode "remembered")
  let moveTimer = null;
  panel.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (panel && !panel.isDestroyed() && panel.isVisible()) {
        const [x, y] = panel.getPosition();
        store.updatePrefs({ panelX: x, panelY: y });
      }
    }, 400);
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
  const mode = store?.prefs?.panelPlacement || 'cursor';

  if (mode === 'remembered' && Number.isFinite(store.prefs.panelX) && Number.isFinite(store.prefs.panelY)) {
    // Last position the user dragged it to, clamped onto a live display
    const target = screen.getDisplayNearestPoint({ x: store.prefs.panelX, y: store.prefs.panelY }).workArea;
    const x = Math.min(Math.max(store.prefs.panelX, target.x), target.x + target.width - width);
    const y = Math.min(Math.max(store.prefs.panelY, target.y), target.y + target.height - height);
    panel.setPosition(Math.round(x), Math.round(y), false);
    return;
  }
  if (mode === 'taskbar') {
    // Fixed flyout above the taskbar corner, like the OS clock/quick settings
    const primary = screen.getPrimaryDisplay().workArea;
    panel.setPosition(
      Math.round(primary.x + primary.width - width - 12),
      Math.round(primary.y + primary.height - height - 12),
      false
    );
    return;
  }
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
  // Reposition only when actually appearing — repositioning a visible panel
  // (Pro stack hotkeys, re-shows) makes it jump to wherever the cursor is.
  if (!win.isVisible()) positionPanel();
  suppressTaskbarFocus = true;
  win.show();
  win.focus();
  win.webContents.send('snapshot', store.getSnapshot());
  startRunningPoll();
  setTimeout(() => {
    suppressTaskbarFocus = false;
  }, 400);
}

function hidePanel() {
  if (panel && !panel.isDestroyed() && panel.isVisible()) {
    lastPanelHideAt = Date.now();
    panel.hide();
  }
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#10141d' : '#f8fafc',
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

/**
 * Invisible host window so ClutterDock stays on the taskbar while running —
 * same job as the Mac Dock icon. Clicking it toggles the launcher. Pin the
 * Start Menu shortcut to keep it there after quit.
 */
function createTaskbarHost() {
  if (!isWin) return;
  if (taskbarHost && !taskbarHost.isDestroyed()) return taskbarHost;

  const iconPath = fs.existsSync(asset('icon.png')) ? asset('icon.png') : undefined;
  taskbarHost = new BrowserWindow({
    width: 1,
    height: 1,
    x: -32000,
    y: -32000,
    show: true,
    frame: false,
    skipTaskbar: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    focusable: true,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'ClutterDock',
    icon: iconPath,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  taskbarHost.setMenu(null);
  taskbarHost.setSkipTaskbar(false);
  // A window that never navigates has no live renderer, which hangs DevTools
  // automation (the e2e suite) waiting on its CDP target. about:blank keeps
  // the window title (no page title to override it).
  taskbarHost.loadURL('about:blank');

  taskbarHost.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    togglePanel();
  });
  taskbarHost.on('minimize', () => {
    hidePanel();
  });
  taskbarHost.on('restore', () => {
    showPanel();
  });
  taskbarHost.on('focus', () => {
    if (suppressTaskbarFocus) return;
    // A taskbar click on an open panel often blurs the panel (which hides it)
    // before this focus event lands — toggling then would instantly reopen the
    // launcher the user just dismissed.
    if (Date.now() - lastPanelHideAt < 350) return;
    togglePanel();
  });

  try {
    app.setUserTasks([
      {
        program: process.execPath,
        arguments: '--open',
        iconPath: process.execPath,
        iconIndex: 0,
        title: 'Open launcher',
        description: 'Show ClutterDock stacks',
      },
      {
        program: process.execPath,
        arguments: '--settings',
        iconPath: process.execPath,
        iconIndex: 0,
        title: 'Settings',
        description: 'ClutterDock Settings',
      },
    ]);
  } catch (_) {
    /* Jump Lists are Windows-only and may fail in portable Temp launches */
  }

  return taskbarHost;
}

function argvHas(flag) {
  return process.argv.some((a) => a === flag || a.endsWith(flag));
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
  tray.setToolTip('ClutterDock — click, or pin the taskbar icon');
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
    if (!ok) console.warn('Hotkey registration failed:', accel);
  } catch (e) {
    console.warn('Hotkey error', e);
  }
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

// Running-app indicators (Windows). One persistent PowerShell child streams
// the GUI process list while the panel is visible — respawning powershell.exe
// every 10s cost a CPU spike and a Defender scan per poll.
let runningWatcher = null;
let lastRunningSig = '';

function startRunningPoll() {
  if (!isWin || runningWatcher) return;
  const script =
    'while($true){' +
    "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty Path -Unique;" +
    "'CDOCK_END';" +
    '[Console]::Out.Flush();' +
    'Start-Sleep -Seconds 5}';
  try {
    runningWatcher = spawn('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    console.warn('running-apps watcher failed to start', e);
    runningWatcher = null;
    return;
  }
  let buffer = '';
  runningWatcher.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    let idx;
    while ((idx = buffer.indexOf('CDOCK_END')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 'CDOCK_END'.length);
      const paths = block
        .split(/\r?\n/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const sig = paths.join('|');
      if (sig !== lastRunningSig && panel && !panel.isDestroyed()) {
        lastRunningSig = sig;
        panel.webContents.send('running-paths', paths);
      }
    }
    if (buffer.length > 262144) buffer = ''; // never let a marker-less stream grow unbounded
  });
  runningWatcher.on('exit', () => {
    runningWatcher = null;
  });
}

function stopRunningPoll() {
  if (runningWatcher) {
    try {
      runningWatcher.kill();
    } catch (_) {
      /* already gone */
    }
    runningWatcher = null;
  }
  lastRunningSig = '';
}

/**
 * Friendly display names for .exe paths from the version resource
 * ("mstsc" → "Remote Desktop Connection"). One PowerShell call per add
 * batch; anything that fails falls back to the basename.
 */
function resolveDisplayNames(paths) {
  const exes = [...new Set((paths || []).filter((p) => /\.exe$/i.test(p) && fs.existsSync(p)))];
  if (!isWin || !exes.length) return Promise.resolve({});
  const list = exes.map((p) => `'${p.replace(/'/g, "''")}'`).join(',');
  const script =
    `foreach($p in @(${list})){` +
    `$d=(Get-Item -LiteralPath $p -ErrorAction SilentlyContinue).VersionInfo.FileDescription;` +
    `Write-Output ($p + '|' + $d)}`;
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        const names = {};
        if (!err) {
          for (const line of String(stdout || '').split(/\r?\n/)) {
            const sep = line.indexOf('|');
            if (sep <= 0) continue;
            const p = line.slice(0, sep);
            const desc = line.slice(sep + 1).trim();
            if (desc && exes.includes(p)) names[p] = desc;
          }
        }
        resolve(names);
      }
    );
  });
}

// Favicons for URL items, cached on disk by host (Favicons/<sha1>.png)
const faviconMemo = new Map(); // host → dataURL | null
const faviconInFlight = new Map();

function faviconCachePath(host) {
  const hash = createHash('sha1').update(host).digest('hex');
  const dir = path.join(dataDir(), 'Favicons');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${hash}.png`);
}

async function getFaviconDataURL(rawUrl) {
  let host;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    host = u.hostname;
  } catch (_) {
    return null;
  }
  if (faviconMemo.has(host)) return faviconMemo.get(host);
  const cached = faviconCachePath(host);
  if (fs.existsSync(cached)) {
    try {
      const img = nativeImage.createFromPath(cached);
      const url = img.isEmpty() ? null : img.toDataURL();
      faviconMemo.set(host, url);
      return url;
    } catch (_) {
      /* refetch below */
    }
  }
  if (process.env.CLUTTER_DOCK_NO_NET) return null;
  if (faviconInFlight.has(host)) return faviconInFlight.get(host);
  const job = (async () => {
    try {
      const res = await fetch(
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const img = nativeImage.createFromBuffer(buf);
      if (img.isEmpty()) throw new Error('not an image');
      fs.writeFileSync(cached, buf);
      const url = img.toDataURL();
      faviconMemo.set(host, url);
      return url;
    } catch (_) {
      faviconMemo.set(host, null); // negative-cache for this session
      return null;
    } finally {
      faviconInFlight.delete(host);
    }
  })();
  faviconInFlight.set(host, job);
  return job;
}

/**
 * Enumerate the user's existing shortcuts (taskbar pins, desktop, Start Menu)
 * for the import wizard. Read-only; targets that no longer exist are skipped.
 */
function scanImportSources() {
  if (!isWin) return [];
  const sources = [
    {
      source: 'Taskbar',
      dir: path.join(
        app.getPath('appData'),
        'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'
      ),
      depth: 0,
    },
    { source: 'Desktop', dir: app.getPath('desktop'), depth: 0 },
    {
      source: 'Start Menu',
      dir: path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      depth: 2,
    },
    {
      source: 'Start Menu',
      dir: path.join('C:', 'ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      depth: 2,
    },
  ];
  const seen = new Set();
  const out = [];
  const walk = (dir, depth, source) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (out.length >= 400) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth > 0) walk(full, depth - 1, source);
        continue;
      }
      if (!/\.lnk$/i.test(entry.name)) continue;
      if (/uninstall/i.test(entry.name)) continue;
      let target;
      try {
        target = shell.readShortcutLink(full).target;
      } catch (_) {
        continue;
      }
      if (!target || !/\.exe$/i.test(target) || !fs.existsSync(target)) continue;
      if (/uninstall|setup|installer/i.test(path.basename(target))) continue;
      const key = target.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source, name: entry.name.replace(/\.lnk$/i, ''), target });
    }
  };
  for (const s of sources) walk(s.dir, s.depth, s.source);
  return out;
}

// "Send to → ClutterDock" in Explorer's right-click menu (packaged builds only —
// in dev the target would be a bare electron.exe)
function sendToShortcutPath() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'ClutterDock.lnk');
}

function syncSendToShortcut() {
  if (!isWin || !app.isPackaged) return;
  try {
    if (store.prefs.sendToShortcut !== false) {
      shell.writeShortcutLink(sendToShortcutPath(), 'update', {
        target: process.execPath,
        description: 'Add to ClutterDock',
      });
    } else {
      fs.rmSync(sendToShortcutPath(), { force: true });
    }
  } catch (e) {
    console.warn('SendTo shortcut sync failed', e);
  }
}

/** Absolute existing paths passed on the command line (Send to / drag onto the exe). */
function extractPathArgs(argv) {
  return (argv || []).filter((a) => {
    if (typeof a !== 'string' || a.startsWith('-')) return false;
    if (!path.isAbsolute(a)) return false;
    const lower = a.toLowerCase();
    if (lower === process.execPath.toLowerCase()) return false;
    if (lower.endsWith('electron.exe') || lower.endsWith('clutterdock.exe')) return false;
    if (lower === path.resolve(__dirname, '..').toLowerCase()) return false;
    try {
      return fs.existsSync(a);
    } catch (_) {
      return false;
    }
  });
}

async function addPathArgs(paths) {
  if (!paths.length || !store) return;
  const names = await resolveDisplayNames(paths);
  const target = store.selectedFolder();
  const targetID = target && target.smartKind === 'none'
    ? target.id
    : store.state.folders.find((f) => f.smartKind === 'none')?.id;
  store.addPaths(paths, targetID, names);
  showPanel();
}

// Taskbar jump list: right-click the icon → jump straight into a stack
let jumpListTimer = null;
let jumpListSig = '';

function refreshJumpList() {
  if (!isWin || !store) return;
  clearTimeout(jumpListTimer);
  jumpListTimer = setTimeout(() => {
    const stacks = store
      .visibleFolders()
      .filter((f) => f.smartKind === 'none')
      .slice(0, 7);
    const sig = stacks.map((f) => `${f.id}:${f.name}`).join('|');
    if (sig === jumpListSig) return;
    jumpListSig = sig;
    try {
      app.setUserTasks([
        ...stacks.map((f) => ({
          program: process.execPath,
          arguments: `--open-stack=${f.id}`,
          iconPath: process.execPath,
          iconIndex: 0,
          title: f.name,
          description: `Open the ${f.name} stack`,
        })),
        {
          program: process.execPath,
          arguments: '--settings',
          iconPath: process.execPath,
          iconIndex: 0,
          title: 'Settings',
          description: 'ClutterDock Settings',
        },
      ]);
    } catch (_) {
      /* Jump Lists may fail in portable Temp launches */
    }
  }, 1500);
}

function argValue(argv, prefix) {
  const hit = (argv || []).find((a) => typeof a === 'string' && a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function applyTheme() {
  const t = store?.prefs?.theme;
  nativeTheme.themeSource = t === 'light' || t === 'dark' ? t : 'system';
}

// Every mutation IPC returns the same envelope: { ok, snapshot, error?, limitMessage? }.
// (The renderer previously had to guess between three different shapes.)
function okSnap(extra = {}) {
  refreshJumpList();
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
    // The panel stays visible: the dialog is parented (modal) so it can't hide
    // behind the always-on-top panel, and re-showing used to teleport the panel
    // to wherever the cursor ended up.
    const result = await showNativeDialog(dialog.showOpenDialog, {
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
      const names = await resolveDisplayNames(result.filePaths);
      addResult = store.addPaths(result.filePaths, null, names);
    }
    return okSnap(addResult?.hitLimit ? { limitMessage: addResult.message } : {});
  });

  ipcMain.handle('add-paths', async (_e, paths, folderID) => {
    const list = paths || [];
    const names = await resolveDisplayNames(list);
    const addResult = store.addPaths(list, folderID, names);
    return okSnap(addResult?.hitLimit ? { limitMessage: addResult.message } : {});
  });

  ipcMain.handle('rename-item', (_e, itemID, folderID, name) => {
    store.renameItem(itemID, folderID, name);
    return okSnap();
  });

  ipcMain.handle('set-folder-color', (_e, folderID, color) => {
    store.setFolderColor(folderID, color);
    return okSnap();
  });

  // Launch an app elevated (context menu → Run as administrator)
  ipcMain.handle('open-item-admin', (_e, itemID) => {
    const item = store.findItem(itemID);
    if (!item || item.kind !== 'app' || !/\.(exe|lnk|bat|cmd|msi)$/i.test(item.path)) {
      return { ok: false, error: 'Only apps can run as administrator.' };
    }
    if (!fs.existsSync(item.path)) return { ok: false, error: 'Missing: ' + item.path };
    try {
      const quoted = `'${item.path.replace(/'/g, "''")}'`;
      execFile(
        'powershell.exe',
        ['-NoProfile', '-Command', `Start-Process -FilePath ${quoted} -Verb RunAs`],
        { timeout: 10000, windowsHide: true },
        () => {}
      );
      store.recordLaunch(item);
      if (store.prefs.closeAfterLaunch) hidePanel();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  // Import wizard: existing taskbar / desktop / Start Menu shortcuts
  ipcMain.handle('scan-import-sources', () => {
    try {
      return scanImportSources();
    } catch (e) {
      console.warn('shortcut scan failed', e);
      return [];
    }
  });

  ipcMain.handle('import-shortcuts', async (_e, entries, folderID) => {
    const clean = (Array.isArray(entries) ? entries : [])
      .filter((x) => x && typeof x.target === 'string' && fs.existsSync(x.target))
      .slice(0, 400);
    if (!clean.length) return okSnap();
    const names = {};
    for (const x of clean) {
      if (typeof x.name === 'string' && x.name.trim()) names[x.target] = x.name.trim();
    }
    const addResult = store.addPaths(clean.map((x) => x.target), folderID, names);
    return okSnap(addResult?.hitLimit ? { limitMessage: addResult.message } : {});
  });

  // Clipboard: Ctrl+V adds copied files/URLs, Ctrl+C puts items on the clipboard
  ipcMain.handle('paste-add', async (_e, folderID) => {
    let paths = [];
    if (isWin) {
      try {
        paths = parseHDrop(clipboard.readBuffer('CF_HDROP')).filter((p) => fs.existsSync(p));
      } catch (_) {
        paths = [];
      }
    }
    if (paths.length) {
      const names = await resolveDisplayNames(paths);
      const addResult = store.addPaths(paths, folderID, names);
      return okSnap(addResult?.hitLimit ? { limitMessage: addResult.message } : { pasted: addResult.added });
    }
    const text = (clipboard.readText() || '').trim();
    if (!text) return okSnap({ pasted: 0 });
    if (path.isAbsolute(text) && fs.existsSync(text)) {
      const names = await resolveDisplayNames([text]);
      const addResult = store.addPaths([text], folderID, names);
      return okSnap({ pasted: addResult.added });
    }
    const urlResult = store.addURL(text, folderID);
    if (urlResult.hitLimit) return okSnap({ limitMessage: urlResult.message });
    return okSnap({ pasted: urlResult.added });
  });

  ipcMain.handle('copy-items', (_e, itemIDs) => {
    const items = (Array.isArray(itemIDs) ? itemIDs : [])
      .map((id) => store.findItem(id))
      .filter(Boolean);
    const files = items.filter((i) => i.kind !== 'url' && fs.existsSync(i.path)).map((i) => i.path);
    const urls = items.filter((i) => i.kind === 'url').map((i) => i.path);
    if (files.length && isWin) {
      const buf = buildHDrop(files);
      if (buf) clipboard.writeBuffer('CF_HDROP', buf);
      return { ok: true, copied: files.length, as: 'files' };
    }
    const text = [...files, ...urls].join('\n');
    if (!text) return { ok: false, error: 'Nothing to copy' };
    clipboard.writeText(text);
    return { ok: true, copied: files.length + urls.length, as: 'text' };
  });

  // A drag over the panel suspends the blur auto-hide (see panel 'blur')
  ipcMain.handle('set-drag-active', (_e, active) => {
    panelDragActiveUntil = active ? Date.now() + 30000 : 0;
  });

  // Native drag-out: Alt+drag a tile into Explorer / Mail / anywhere
  ipcMain.on('drag-out', async (e, itemID) => {
    const item = store.findItem(itemID);
    if (!item || item.kind === 'url' || !fs.existsSync(item.path)) return;
    let icon = null;
    try {
      icon = await app.getFileIcon(item.path, { size: 'normal' });
    } catch (_) {
      /* fallback below */
    }
    if (!icon || icon.isEmpty()) icon = nativeImage.createFromPath(asset('icon.png'));
    try {
      e.sender.startDrag({ file: item.path, icon });
    } catch (err) {
      console.warn('drag-out failed', err);
    }
  });

  // Custom data folder (e.g. OneDrive) — takes effect after relaunch
  ipcMain.handle('choose-data-dir', async () => {
    const result = await showNativeDialog(dialog.showOpenDialog, {
      title: 'Choose where ClutterDock stores its data',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const rootTarget = result.filePaths[0];
    try {
      const probe = path.join(rootTarget, '.clutterdock-write-test');
      fs.writeFileSync(probe, 'ok');
      fs.rmSync(probe, { force: true });
      store.flushPendingSave();
      const src = dataDir();
      const dest = path.join(rootTarget, 'ClutterDock');
      if (path.resolve(src) !== path.resolve(dest)) {
        fs.cpSync(src, dest, { recursive: true });
      }
      setDataDirPointer(rootTarget);
      return { ok: true, dir: dest, needsRestart: true };
    } catch (e) {
      return { ok: false, error: 'Could not use that folder: ' + String(e.message || e) };
    }
  });

  ipcMain.handle('reset-data-dir', () => {
    try {
      store.flushPendingSave();
      setDataDirPointer(null);
      return { ok: true, needsRestart: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('relaunch-app', () => {
    isQuitting = true;
    app.relaunch();
    app.quit();
  });

  // Settings can hand off to the panel's import wizard
  ipcMain.handle('open-import-wizard', () => {
    showPanel();
    if (panel && !panel.isDestroyed()) panel.webContents.send('open-import');
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
    installRegisterChoice: 'string',
    keepOpen: 'boolean',
    theme: 'string',
    panelPlacement: 'string',
    transparencyEffects: 'boolean',
    sendToShortcut: 'boolean',
  };

  ipcMain.handle('update-prefs', (_e, partial) => {
    const clean = {};
    for (const [key, type] of Object.entries(PREF_TYPES)) {
      if (partial && typeof partial[key] === type) clean[key] = partial[key];
    }
    // The renderer may only mark the register offer as skipped; 'registered'
    // is set by the register-install handler after a successful POST.
    if ('installRegisterChoice' in clean && clean.installRegisterChoice !== 'skipped') {
      delete clean.installRegisterChoice;
    }
    // Enum prefs: junk values fall back to their defaults rather than persisting
    if ('theme' in clean && !['system', 'light', 'dark'].includes(clean.theme)) {
      clean.theme = 'system';
    }
    if ('panelPlacement' in clean && !['cursor', 'remembered', 'taskbar'].includes(clean.panelPlacement)) {
      clean.panelPlacement = 'cursor';
    }
    store.updatePrefs(clean);
    if ('theme' in clean) applyTheme();
    if ('transparencyEffects' in clean && panel && !panel.isDestroyed() && acrylicSupported) {
      try {
        panel.setBackgroundMaterial(clean.transparencyEffects ? 'acrylic' : 'none');
        store.runtimeInfo = { ...(store.runtimeInfo || {}), acrylic: clean.transparencyEffects };
      } catch (_) {
        /* older Electron */
      }
    }
    if ('sendToShortcut' in clean) syncSendToShortcut();
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

  // Opt-in install register (RON-507). Sends exactly: platform, app version,
  // the random installId, and an email the user typed. Never stacks or paths.
  ipcMain.handle('register-install', async (_e, email) => {
    const cleanEmail = typeof email === 'string' ? email.trim().slice(0, 254) : '';
    const payload = {
      os: 'windows',
      appVersion: app.getVersion(),
      installId: store.prefs.installId,
    };
    if (cleanEmail) payload.email = cleanEmail;
    try {
      const res = await fetch('https://clutterdock.com/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      store.updatePrefs({
        installRegisterChoice: 'registered',
        ...(cleanEmail ? { registeredEmail: cleanEmail } : {}),
      });
      return okSnap();
    } catch (err) {
      console.warn('register-install failed:', String(err).slice(0, 200));
      return failSnap("Couldn't reach clutterdock.com — try again later.");
    }
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
    const result = await showNativeDialog(dialog.showSaveDialog, {
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
    const result = await showNativeDialog(dialog.showOpenDialog, {
      title: 'Import ClutterDock pack',
      properties: ['openFile'],
      filters: [{ name: 'ClutterDock pack', extensions: ['clutterdock', 'slavedock', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, canceled: true, snapshot: store.getSnapshot() };
    }
    if (!merge) {
      const confirm = await showNativeDialog(dialog.showMessageBox, {
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
    const result = await showNativeDialog(dialog.showOpenDialog, {
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
    if (!item) return null;
    if (item.kind === 'url') return getFaviconDataURL(item.path);
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
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!store) return;
    if (argv && argv.some((a) => a === '--settings' || String(a).endsWith('--settings'))) {
      createSettings();
      return;
    }
    const stackID = argValue(argv, '--open-stack=');
    if (stackID) {
      store.selectFolder(stackID);
      showPanel();
      return;
    }
    // "Send to → ClutterDock" / files dragged onto the exe arrive as argv paths
    const dropped = extractPathArgs(argv);
    if (dropped.length) {
      addPathArgs(dropped);
      return;
    }
    showPanel();
  });

  app.whenReady().then(() => {
    // No app menu on Windows — the default one exposes devtools/reload in production.
    if (!isMac) Menu.setApplicationMenu(null);
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

    applyTheme();
    wireIpc();
    createTray();
    if (isWin) createTaskbarHost();
    createPanel();
    registerHotkey();
    syncSendToShortcut();
    refreshJumpList();

    // Follow OS theme switches — a stale backgroundColor flashes the old
    // theme's color on every resize/show.
    nativeTheme.on('updated', () => {
      const dark = nativeTheme.shouldUseDarkColors;
      if (panel && !panel.isDestroyed()) panel.setBackgroundColor(dark ? '#10141d' : '#f4f6fb');
      if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.setBackgroundColor(dark ? '#10141d' : '#f8fafc');
      }
    });

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

    if (argvHas('--settings')) {
      setTimeout(() => createSettings(), 400);
    } else if (argValue(process.argv, '--open-stack=')) {
      store.selectFolder(argValue(process.argv, '--open-stack='));
      setTimeout(() => showPanel(), 400);
    } else if (!store.prefs.hasCompletedOnboarding || argvHas('--open')) {
      setTimeout(() => showPanel(), 400);
    }

    // Files handed over at launch (Send to while the app wasn't running)
    const launchPaths = extractPathArgs(process.argv.slice(1));
    if (launchPaths.length) setTimeout(() => addPathArgs(launchPaths), 600);

    // Background update check (NSIS installs)
    if (store.prefs.checkForUpdatesAutomatically !== false && !process.env.CLUTTER_DOCK_NO_UPDATE) {
      setTimeout(() => {
        updater?.check(false).catch(() => {});
      }, 12000);
    }

    app.on('activate', () => showPanel());
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  store?.flushPendingSave(); // writes are debounced; nothing may be lost on quit
  stopRunningPoll();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  store?.flushPendingSave();
});

// Keep running in the tray when panel/settings close
app.on('window-all-closed', (e) => {
  // Do not quit — tray stays alive until user chooses Quit
});
