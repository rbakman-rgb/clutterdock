const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

// In plain Node (tests), require('electron') resolves to the binary-path string —
// fall back to CLUTTERDOCK_DATA_DIR so the store is testable without Electron.
const electronApp = (() => {
  try {
    const e = require('electron');
    return e && e.app ? e.app : null;
  } catch (_) {
    return null;
  }
})();
const {
  validate: validateLicense,
  mask: maskLicense,
  createFeatureGate,
  PRO_HISTORY,
} = require('./license');
const { lockItems, unlockItems, relockItems } = require('./stack-lock');

const CURRENT_VERSION = 1;

/**
 * Users can point the data folder somewhere else (e.g. OneDrive) — the pointer
 * itself always lives in the default root so it can be found at boot.
 */
function defaultRoot() {
  return electronApp
    ? electronApp.getPath('userData')
    : process.env.CLUTTERDOCK_DATA_DIR || path.join(os.tmpdir(), 'clutterdock-test');
}

function dataDirPointerPath() {
  return path.join(defaultRoot(), 'datadir.json');
}

function readDataDirPointer() {
  if (!electronApp) return null; // tests always use the env dir directly
  try {
    const raw = JSON.parse(fs.readFileSync(dataDirPointerPath(), 'utf8'));
    if (raw && typeof raw.dir === 'string' && raw.dir && fs.existsSync(raw.dir)) return raw.dir;
  } catch (_) {
    /* no pointer or unreadable — use the default */
  }
  return null;
}

function setDataDirPointer(dir) {
  if (dir) {
    fs.writeFileSync(dataDirPointerPath(), JSON.stringify({ dir }), 'utf8');
  } else {
    fs.rmSync(dataDirPointerPath(), { force: true });
  }
  _dataDirCache = null;
}

let _dataDirCache = null;

function dataDir() {
  if (_dataDirCache) return _dataDirCache;
  const root = readDataDirPointer() || defaultRoot();
  const dir = path.join(root, 'ClutterDock');
  if (!fs.existsSync(dir)) {
    for (const legacy of ['SlaveDock', 'DockFolder']) {
      const src = path.join(root, legacy);
      if (fs.existsSync(src)) {
        try {
          fs.cpSync(src, dir, { recursive: true });
        } catch (e) {
          console.error('ClutterDock migrate data dir', e);
        }
        break;
      }
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  _dataDirCache = dir;
  return dir;
}

/** One backup per day, keep the last 7 — protects against user mistakes, not just corruption. */
function rotateBackups() {
  try {
    const src = configPath();
    if (!fs.existsSync(src)) return;
    const dir = path.join(dataDir(), 'Backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = path.join(dir, `folders-${stamp}.json`);
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    const backups = fs
      .readdirSync(dir)
      .filter((f) => /^folders-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - 7))) {
      fs.rmSync(path.join(dir, old), { force: true });
    }
  } catch (e) {
    console.error('ClutterDock backup rotation failed', e);
  }
}

function configPath() {
  return path.join(dataDir(), 'folders.json');
}

function historyPath() {
  return path.join(dataDir(), 'history.json');
}

function prefsPath() {
  return path.join(dataDir(), 'prefs.json');
}

function defaultState() {
  return {
    version: CURRENT_VERSION,
    folders: [
      { id: randomUUID(), name: 'Apps', items: [], symbol: 'grid', sortMode: 'manual', viewMode: 'grid', smartKind: 'none' },
      { id: randomUUID(), name: 'Recents', items: [], symbol: 'clock', sortMode: 'manual', viewMode: 'grid', smartKind: 'recents' },
    ],
    selectedFolderID: null,
    workspaces: [{ id: randomUUID(), name: 'All', folderIDs: [] }],
    activeWorkspaceID: null,
  };
}

function defaultPrefs() {
  return {
    hotkey: 'CommandOrControl+Shift+D',
    closeAfterLaunch: true,
    hasCompletedOnboarding: false,
    showKeyboardHints: true,
    launchAtLogin: false,
    keepOpen: false,
    theme: 'system',
    panelPlacement: 'cursor',
    panelX: null,
    panelY: null,
    // Off by default: Windows re-composites the acrylic backdrop AFTER a hidden
    // window re-shows, which flashes visibly on every open (seen on video).
    transparencyEffects: false,
    sendToShortcut: true,
    licenseKey: '',
    themeAccent: 'system',
    checkForUpdatesAutomatically: true,
    // Opt-in install register (RON-507): '' = not asked, 'skipped', 'registered'.
    installRegisterChoice: '',
    registeredEmail: '',
    installId: '',
  };
}

/**
 * Load a JSON file. If the file exists but is unreadable, preserve it as
 * <file>.corrupt.bak (never silently destroy user data) and report via onCorrupt.
 */
function loadJSON(file, fallback, onCorrupt) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    console.error('ClutterDock load error', file, e);
    const backup = file + '.corrupt.bak';
    try {
      fs.copyFileSync(file, backup);
      if (onCorrupt) onCorrupt(backup);
    } catch (copyErr) {
      console.error('ClutterDock backup error', backup, copyErr);
    }
    return fallback;
  }
}

/** Atomic write: a crash mid-write must never truncate the existing file. */
function saveJSON(file, data) {
  const tmp = file + '.tmp';
  try {
    // Compact JSON: at Pro-scale stores the pretty form is ~30% larger and this
    // path runs on every (debounced) mutation.
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('ClutterDock save error', file, e);
    try {
      fs.rmSync(tmp, { force: true });
    } catch (_) {
      /* ignore */
    }
  }
}

class Store {
  constructor() {
    this.dataWarning = null;
    this._unlocked = new Set();
    this._sessionPasswords = {};
    this._saveTimer = null;
    this._historyTimer = null;
    rotateBackups();
    this.state = loadJSON(configPath(), defaultState(), (backup) => {
      this.dataWarning =
        'Your stacks file was unreadable, so ClutterDock started fresh. ' +
        'The original was preserved at:\n' + backup;
    });
    if (!this.state.folders?.length) {
      this.state = defaultState();
    }
    if (!this.state.selectedFolderID) {
      this.state.selectedFolderID = this.state.folders[0]?.id ?? null;
    }
    this.history = loadJSON(historyPath(), { entries: [] });
    if (!Array.isArray(this.history.entries)) this.history.entries = [];
    this.prefs = { ...defaultPrefs(), ...loadJSON(prefsPath(), {}) };
    if (!this.prefs.installId) {
      // Random, stable across launches; the only identifier the optional
      // install register ever sends (RON-507).
      this.prefs.installId = randomUUID();
      this.persistPrefs();
    }
    if (!Array.isArray(this.state.workspaces) || !this.state.workspaces.length) {
      this.state.workspaces = [{ id: randomUUID(), name: 'All', folderIDs: [] }];
    }
    this._ensureSmartFolders();
  }

  // MARK: Workspaces (Pro) — mirrors the Mac model: a workspace is a subset of
  // folders; the "All" workspace (empty folderIDs) shows everything.

  activeWorkspace() {
    const list = this.state.workspaces || [];
    return list.find((w) => w.id === this.state.activeWorkspaceID) || list[0] || null;
  }

  visibleFolders() {
    const ws = this.activeWorkspace();
    if (!ws || !Array.isArray(ws.folderIDs) || !ws.folderIDs.length) {
      return this.state.folders;
    }
    const map = new Map(this.state.folders.map((f) => [f.id, f]));
    return ws.folderIDs.map((id) => map.get(id)).filter(Boolean);
  }

  addWorkspace(name) {
    const ws = {
      id: randomUUID(),
      name: (String(name || '').trim() || 'Workspace').slice(0, 60),
      folderIDs: [],
    };
    this.state.workspaces.push(ws);
    this.state.activeWorkspaceID = ws.id;
    this.persist();
    return ws;
  }

  renameWorkspace(id, name) {
    const ws = this.state.workspaces.find((w) => w.id === id);
    const n = String(name || '').trim();
    if (!ws || !n) return;
    ws.name = n.slice(0, 60);
    this.persist();
  }

  deleteWorkspace(id) {
    if (this.state.workspaces.length <= 1) return;
    this.state.workspaces = this.state.workspaces.filter((w) => w.id !== id);
    if (this.state.activeWorkspaceID === id) {
      this.state.activeWorkspaceID = this.state.workspaces[0]?.id ?? null;
    }
    this.persist();
  }

  selectWorkspace(id) {
    if (!this.state.workspaces.some((w) => w.id === id)) return;
    this.state.activeWorkspaceID = id;
    const visible = this.visibleFolders();
    if (!visible.some((f) => f.id === this.state.selectedFolderID)) {
      this.state.selectedFolderID = visible[0]?.id ?? null;
    }
    this.persist();
  }

  toggleWorkspaceFolder(workspaceID, folderID) {
    const ws = this.state.workspaces.find((w) => w.id === workspaceID);
    if (!ws) return;
    if (!Array.isArray(ws.folderIDs)) ws.folderIDs = [];
    const idx = ws.folderIDs.indexOf(folderID);
    if (idx >= 0) ws.folderIDs.splice(idx, 1);
    else ws.folderIDs.push(folderID);
    this.persist();
  }

  // MARK: Custom folder images (Pro)

  setFolderImage(id, sourcePath) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || f.smartKind !== 'none') return false;
    const dir = path.join(dataDir(), 'FolderImages');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${f.id}${path.extname(sourcePath) || '.png'}`);
    try {
      fs.copyFileSync(sourcePath, dest);
    } catch (e) {
      console.error('ClutterDock folder image copy failed', e);
      return false;
    }
    f.customImage = dest;
    this.persist();
    return true;
  }

  clearFolderImage(id) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || !f.customImage) return;
    try {
      fs.rmSync(f.customImage, { force: true });
    } catch (_) {
      /* ignore */
    }
    delete f.customImage;
    this.persist();
  }

  get isPro() {
    // Snapshots read this several times each; don't recompute the HMAC every access
    const key = this.prefs.licenseKey || '';
    if (this._isProForKey !== key) {
      this._isProForKey = key;
      this._isPro = validateLicense(key);
    }
    return this._isPro;
  }

  get gate() {
    return createFeatureGate(this.isPro);
  }

  activateLicense(key) {
    const trimmed = String(key || '').trim();
    if (!validateLicense(trimmed)) {
      return { ok: false, error: 'That license key isn’t valid.' };
    }
    this.prefs.licenseKey = trimmed.toUpperCase();
    this.persistPrefs();
    return { ok: true, isPro: true, display: maskLicense(trimmed) };
  }

  deactivateLicense() {
    this.prefs.licenseKey = '';
    this.persistPrefs();
    return { ok: true, isPro: false };
  }

  _ensureSmartFolders() {
    let changed = false;
    if (!this.state.folders.some((f) => f.smartKind === 'recents')) {
      this.state.folders.push({
        id: randomUUID(),
        name: 'Recents',
        items: [],
        symbol: 'clock',
        sortMode: 'manual',
        viewMode: 'grid',
        smartKind: 'recents',
      });
      changed = true;
    }
    if (!this.state.folders.some((f) => f.smartKind === 'mostused')) {
      this.state.folders.push({
        id: randomUUID(),
        name: 'Most Used',
        items: [],
        symbol: 'star',
        sortMode: 'manual',
        viewMode: 'grid',
        smartKind: 'mostused',
      });
      changed = true;
    }
    if (changed) this.persist();
  }

  /**
   * Debounced persist: every mutation used to synchronously rewrite the whole
   * store (~150-215ms per op at a 600KB store in the stress suite). Mutations
   * now coalesce into one write. Anything that must be durable immediately
   * (lock/unlock, import) calls persistNow(); main flushes on quit.
   */
  persist() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.persistNow(), 250);
  }

  persistNow() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    this.state.version = CURRENT_VERSION;
    saveJSON(configPath(), { ...this.state, folders: this._sealedFolders() });
  }

  flushPendingSave() {
    if (this._saveTimer) this.persistNow();
    if (this._historyTimer) this.persistHistoryNow();
  }

  persistHistory() {
    clearTimeout(this._historyTimer);
    this._historyTimer = setTimeout(() => this.persistHistoryNow(), 500);
  }

  persistHistoryNow() {
    clearTimeout(this._historyTimer);
    this._historyTimer = null;
    saveJSON(historyPath(), this.history);
  }

  persistPrefs() {
    saveJSON(prefsPath(), this.prefs);
  }

  getSnapshot() {
    const gate = this.gate;
    return {
      state: this.state,
      prefs: {
        ...this.prefs,
        licenseKey: undefined, // never send full key to renderer list dumps
        licenseKeyDisplay: this.isPro ? maskLicense(this.prefs.licenseKey) : '',
      },
      history: this.history.entries.slice(0, gate.historyLimit),
      visibleFolderIDs: this.visibleFolders().map((f) => f.id),
      lockedFolderIDs: this.state.folders.filter((f) => this.isLocked(f)).map((f) => f.id),
      dataDir: dataDir(),
      dataWarning: this.dataWarning,
      // Main-process runtime facts the renderer needs (acrylic support, etc.)
      runtime: this.runtimeInfo || {},
      license: {
        isPro: this.isPro,
        display: this.isPro ? maskLicense(this.prefs.licenseKey) : '',
      },
      gate: {
        isPro: gate.isPro,
        freeMaxFolders: gate.freeMaxFolders,
        freeMaxItems: gate.freeMaxItems,
        canUseGlobalSearch: gate.canUseGlobalSearch,
        canUseWorkspaces: gate.canUseWorkspaces,
        canExportPack: gate.canExportPack,
        historyLimit: gate.historyLimit,
      },
    };
  }

  // MARK: Password-protected stacks (Pro).
  // Passwords live in memory only (this._sessionPasswords) and are never persisted.

  isLocked(folder) {
    return !!(folder && folder.lock && !this._unlocked.has(folder.id));
  }

  lockFolder(id, password) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || f.smartKind !== 'none') return { ok: false, error: 'That stack can’t be locked.' };
    try {
      f.lock = lockItems(f.items || [], password);
      f.items = [];
      this._unlocked.delete(id);
      delete this._sessionPasswords[id];
      this.persistNow(); // sealing must hit disk immediately
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  unlockFolder(id, password) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || !f.lock) return { ok: false, error: 'That stack isn’t locked.' };
    try {
      f.items = unlockItems(f.lock, password);
      this._unlocked.add(id);
      this._sessionPasswords[id] = password;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  relockFolder(id) {
    const f = this.state.folders.find((x) => x.id === id);
    const password = this._sessionPasswords[id];
    if (!f || !f.lock || !password) return { ok: false };
    try {
      f.lock = relockItems(f.items || [], f.lock, password);
    } catch (e) {
      console.error('ClutterDock relock failed', e);
    }
    f.items = [];
    this._unlocked.delete(id);
    delete this._sessionPasswords[id];
    this.persistNow(); // sealing must hit disk immediately
    return { ok: true };
  }

  removeLock(id) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || !this._unlocked.has(id)) return { ok: false };
    delete f.lock;
    this._unlocked.delete(id);
    delete this._sessionPasswords[id];
    this.persistNow();
    return { ok: true };
  }

  /** Re-seals every unlocked stack so plaintext never reaches folders.json. */
  _sealedFolders() {
    return this.state.folders.map((f) => {
      if (!f.lock || !this._unlocked.has(f.id) || !this._sessionPasswords[f.id]) return f;
      const copy = { ...f, items: [] };
      try {
        copy.lock = relockItems(f.items || [], f.lock, this._sessionPasswords[f.id]);
      } catch (e) {
        console.error('ClutterDock seal failed', e);
      }
      return copy;
    });
  }

  /** Resolve an item by id across folders and launch history. */
  findItem(itemID) {
    if (!itemID || typeof itemID !== 'string') return null;
    for (const f of this.state.folders) {
      const item = (f.items || []).find((i) => i.id === itemID);
      if (item) return item;
    }
    const h = this.history.entries.find((e) => e.id === itemID);
    if (h) return { id: h.id, kind: h.kind, path: h.path, name: h.name };
    return null;
  }

  normalFolderCount() {
    return this.state.folders.filter((f) => f.smartKind === 'none').length;
  }

  selectedFolder() {
    return (
      this.state.folders.find((f) => f.id === this.state.selectedFolderID) ||
      this.state.folders[0]
    );
  }

  selectFolder(id) {
    if (this.state.folders.some((f) => f.id === id)) {
      this.state.selectedFolderID = id;
      this.persist();
    }
  }

  addFolder(name, symbol) {
    const count = this.normalFolderCount();
    if (!this.gate.canAddFolder(count)) {
      return { ok: false, hitLimit: true, message: this.gate.folderLimitMessage(count) };
    }
    const folder = {
      id: randomUUID(),
      name: (name || 'Stack').trim() || 'Stack',
      items: [],
      symbol: symbol || 'folder',
      sortMode: 'manual',
      viewMode: 'grid',
      smartKind: 'none',
    };
    this.state.folders.push(folder);
    this.state.selectedFolderID = folder.id;
    this.persist();
    return { ok: true, folder };
  }

  renameFolder(id, name) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || f.smartKind !== 'none') return;
    const n = (name || '').trim();
    if (!n) return;
    f.name = n;
    this.persist();
  }

  setFolderSymbol(id, symbol) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || f.smartKind !== 'none') return;
    f.symbol = symbol || 'folder';
    this.persist();
  }

  /** Stack accent color: a palette hex or '' to clear. */
  setFolderColor(id, color) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || f.smartKind !== 'none') return;
    const c = String(color || '');
    if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) return;
    if (c) f.color = c;
    else delete f.color;
    this.persist();
  }

  renameItem(itemID, folderID, name) {
    const targetID = folderID || this.state.selectedFolderID;
    const f = this.state.folders.find((x) => x.id === targetID);
    if (!f || f.smartKind !== 'none') return false;
    const item = f.items.find((i) => i.id === itemID);
    const n = String(name || '').trim().slice(0, 120);
    if (!item || !n) return false;
    item.name = n;
    this.persist();
    return true;
  }

  deleteFolder(id) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f) return;
    const normals = this.state.folders.filter((x) => x.smartKind === 'none');
    if (f.smartKind === 'none' && normals.length <= 1) return;
    if (f.customImage) {
      try {
        fs.rmSync(f.customImage, { force: true });
      } catch (_) {
        /* ignore */
      }
    }
    this.state.folders = this.state.folders.filter((x) => x.id !== id);
    if (this.state.selectedFolderID === id) {
      this.state.selectedFolderID = this.state.folders[0]?.id ?? null;
    }
    this.persist();
  }

  setFolderView(id, viewMode) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f) return;
    f.viewMode = viewMode === 'list' ? 'list' : 'grid';
    this.persist();
  }

  setFolderSort(id, sortMode) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f || f.smartKind !== 'none') return;
    f.sortMode = sortMode;
    this.persist();
  }

  /** `names` (optional): path → friendly display name (e.g. exe FileDescription). */
  addPaths(paths, folderID, names) {
    const targetID = folderID || this.state.selectedFolderID;
    const f = this.state.folders.find((x) => x.id === targetID);
    if (!f || f.smartKind !== 'none') return { added: 0, hitLimit: false };
    const existing = new Set(f.items.map((i) => `${i.kind}|${i.path}`));
    let added = 0;
    let hitLimit = false;
    for (const p of paths) {
      if (!this.gate.canAddItem(f.items.length)) {
        hitLimit = true;
        break;
      }
      if (!p || !fs.existsSync(p)) continue;
      const kind = detectKind(p);
      const key = `${kind}|${p}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const friendly = names && typeof names[p] === 'string' && names[p].trim();
      f.items.push({
        id: randomUUID(),
        kind,
        path: p,
        name: (friendly && friendly.slice(0, 120)) || displayName(p, kind),
      });
      added += 1;
    }
    if (added) this.persist();
    return {
      added,
      hitLimit,
      message: hitLimit ? this.gate.itemLimitMessage(f.items.length) : null,
    };
  }

  addURL(urlString, folderID) {
    let s = (urlString || '').trim();
    if (!s) return { added: 0, hitLimit: false };
    // Only bare hostnames get an implicit https:// — prefixing something that already
    // carries a scheme (ms-msdt:, file:) would smuggle it through as a fake https URL.
    const hasScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(s);
    if (!hasScheme) {
      if (!/^[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}(\/\S*)?$/.test(s)) {
        return { added: 0, hitLimit: false };
      }
      s = 'https://' + s;
    }
    try {
      // Web-style URLs only — a file:// or ms-* "link" would be a disguised launcher.
      const u = new URL(s);
      if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) {
        return { added: 0, hitLimit: false };
      }
    } catch {
      return { added: 0, hitLimit: false };
    }
    const targetID = folderID || this.state.selectedFolderID;
    const f = this.state.folders.find((x) => x.id === targetID);
    if (!f || f.smartKind !== 'none') return { added: 0, hitLimit: false };
    if (!this.gate.canAddItem(f.items.length)) {
      return {
        added: 0,
        hitLimit: true,
        message: this.gate.itemLimitMessage(f.items.length),
      };
    }
    if (f.items.some((i) => i.kind === 'url' && i.path === s)) return { added: 0, hitLimit: false };
    let name;
    try {
      name = new URL(s).hostname || s;
    } catch {
      name = s;
    }
    f.items.push({ id: randomUUID(), kind: 'url', path: s, name });
    this.persist();
    return { added: 1, hitLimit: false };
  }

  removeItem(itemID, folderID) {
    const targetID = folderID || this.state.selectedFolderID;
    const f = this.state.folders.find((x) => x.id === targetID);
    if (!f || f.smartKind !== 'none') return;
    f.items = f.items.filter((i) => i.id !== itemID);
    this.persist();
  }

  reorderItem(itemID, toIndex, folderID) {
    const targetID = folderID || this.state.selectedFolderID;
    const f = this.state.folders.find((x) => x.id === targetID);
    if (!f || f.smartKind !== 'none') return;
    const from = f.items.findIndex((i) => i.id === itemID);
    if (from < 0) return;
    f.sortMode = 'manual';
    const [item] = f.items.splice(from, 1);
    const dest = Math.max(0, Math.min(toIndex, f.items.length));
    f.items.splice(dest, 0, item);
    this.persist();
  }

  relocateItem(itemID, destinationID) {
    const dest = this.state.folders.find((x) => x.id === destinationID);
    if (!dest || dest.smartKind !== 'none') return { ok: false, hitLimit: false };

    let source = null;
    let item = null;
    let sourceIndex = -1;
    for (const f of this.state.folders) {
      if (f.smartKind !== 'none') continue;
      const idx = f.items.findIndex((i) => i.id === itemID);
      if (idx >= 0) {
        source = f;
        item = f.items[idx];
        sourceIndex = idx;
        f.items.splice(idx, 1);
        break;
      }
    }
    if (!source || !item) return { ok: false, hitLimit: false };
    if (source.id === dest.id) {
      // Dropping onto its own folder is a no-op: restore the original position
      // (pushing to the end silently reordered without persisting).
      source.items.splice(sourceIndex, 0, item);
      return { ok: true, hitLimit: false };
    }
    const key = `${item.kind}|${item.path}`;
    if (dest.items.some((i) => `${i.kind}|${i.path}` === key)) {
      this.persist();
      return { ok: true, hitLimit: false };
    }
    if (!this.gate.canAddItem(dest.items.length)) {
      source.items.push(item); // restore
      return {
        ok: false,
        hitLimit: true,
        message: this.gate.itemLimitMessage(dest.items.length),
      };
    }
    dest.sortMode = 'manual';
    dest.items.push(item);
    this.persist();
    return { ok: true, hitLimit: false };
  }

  nudgeItem(itemID, delta, folderID) {
    const targetID = folderID || this.state.selectedFolderID;
    const f = this.state.folders.find((x) => x.id === targetID);
    if (!f || f.smartKind !== 'none') return false;
    const from = f.items.findIndex((i) => i.id === itemID);
    if (from < 0) return false;
    const to = from + delta;
    if (to < 0 || to >= f.items.length) return false;
    f.sortMode = 'manual';
    const tmp = f.items[from];
    f.items[from] = f.items[to];
    f.items[to] = tmp;
    this.persist();
    return true;
  }

  recordLaunch(item) {
    const entries = this.history.entries;
    const idx = entries.findIndex((e) => e.path === item.path && e.kind === item.kind);
    if (idx >= 0) {
      const e = entries.splice(idx, 1)[0];
      e.lastOpened = new Date().toISOString();
      e.openCount = (e.openCount || 1) + 1;
      e.name = item.name;
      entries.unshift(e);
    } else {
      entries.unshift({
        id: randomUUID(),
        kind: item.kind,
        path: item.path,
        name: item.name,
        lastOpened: new Date().toISOString(),
        openCount: 1,
      });
    }
    this.history.entries = entries.slice(0, PRO_HISTORY);
    this.persistHistory();
  }

  searchAll(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    const frecency = new Map(
      this.history.entries.map((e) => [`${e.kind}|${e.path}`, e])
    );
    const hits = [];
    for (const folder of this.state.folders) {
      if (folder.smartKind !== 'none') continue;
      if (this.isLocked(folder)) continue; // a locked stack must not leak via search
      for (const item of folder.items || []) {
        const score = searchScore(item, q, frecency.get(`${item.kind}|${item.path}`));
        if (score > 0) {
          hits.push({ item, folderName: folder.name, folderID: folder.id, score });
        }
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  exportPack() {
    if (!this.gate.canExportPack) {
      throw new Error('Pack export requires ClutterDock Pro.');
    }
    // Export the sealed form so a pack never carries a locked stack in the clear
    return JSON.stringify({ ...this.state, folders: this._sealedFolders() }, null, 2);
  }

  importPack(json, merge) {
    let data;
    try {
      data = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
      throw new Error('Not a valid pack file');
    }
    // A pack is untrusted input: normalize every folder/item, regenerate all ids,
    // and drop anything that isn't a plain launchable entry.
    const folders = sanitizePackFolders(data?.folders);
    if (!folders.length) throw new Error('The pack contains no importable folders');
    if (merge) {
      for (const folder of folders) {
        const existing = this.state.folders.find(
          (f) => f.name === folder.name && f.smartKind === 'none'
        );
        if (existing) {
          this.addPaths(
            folder.items.filter((i) => i.kind !== 'url').map((i) => i.path),
            existing.id
          );
          for (const i of folder.items) {
            if (i.kind === 'url') this.addURL(i.path, existing.id);
          }
        } else {
          this.state.folders.push(folder);
        }
      }
    } else {
      // Keep a restorable copy of the data being replaced.
      try {
        if (fs.existsSync(configPath())) {
          fs.copyFileSync(configPath(), configPath() + '.pre-import.bak');
        }
      } catch (e) {
        console.error('ClutterDock pre-import backup failed', e);
      }
      this.state = {
        version: CURRENT_VERSION,
        folders,
        selectedFolderID: folders[0]?.id ?? null,
        workspaces: this.state.workspaces,
        activeWorkspaceID: null,
      };
      this._ensureSmartFolders();
    }
    this.persistNow();
  }

  updatePrefs( partial) {
    this.prefs = { ...this.prefs, ...partial };
    this.persistPrefs();
  }
}

const PACK_KINDS = new Set(['app', 'file', 'folder', 'url']);
const PACK_SORT_MODES = new Set(['manual', 'nameAZ', 'nameZA', 'kind']);

/** Normalize untrusted pack folders: valid kinds only, http(s) URLs only, fresh ids. */
function sanitizePackFolders(rawFolders) {
  if (!Array.isArray(rawFolders)) return [];
  const folders = [];
  for (const raw of rawFolders) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.smartKind && raw.smartKind !== 'none') continue; // smart folders are rebuilt locally
    const items = [];
    for (const item of Array.isArray(raw.items) ? raw.items : []) {
      if (!item || typeof item !== 'object') continue;
      const kind = String(item.kind || '');
      const p = typeof item.path === 'string' ? item.path.trim() : '';
      if (!PACK_KINDS.has(kind) || !p) continue;
      if (kind === 'url') {
        try {
          const u = new URL(p);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        } catch {
          continue;
        }
      }
      items.push({
        id: randomUUID(),
        kind,
        path: p,
        name: (typeof item.name === 'string' && item.name.trim()) || displayName(p, kind),
      });
    }
    const folder = {
      id: randomUUID(),
      name: ((typeof raw.name === 'string' && raw.name.trim()) || 'Stack').slice(0, 80),
      items,
      symbol: typeof raw.symbol === 'string' ? raw.symbol : 'folder',
      sortMode: PACK_SORT_MODES.has(raw.sortMode) ? raw.sortMode : 'manual',
      viewMode: raw.viewMode === 'list' ? 'list' : 'grid',
      smartKind: 'none',
    };
    // Carry an encrypted stack across intact — the importer needs the password,
    // and the payload is opaque, so only well-formed fields are copied.
    const lk = raw.lock;
    if (lk && typeof lk.salt === 'string' && typeof lk.nonce === 'string' && typeof lk.ct === 'string') {
      folder.lock = {
        v: Number(lk.v) || 1,
        salt: lk.salt,
        iter: Number(lk.iter) || 200000,
        nonce: lk.nonce,
        ct: lk.ct,
      };
      folder.items = [];
    }
    folders.push(folder);
  }
  return folders;
}

function detectKind(p) {
  const lower = p.toLowerCase();
  try {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (lower.endsWith('.app')) return 'app'; // mac residual
      return 'folder';
    }
  } catch {
    return 'file';
  }
  if (lower.endsWith('.exe') || lower.endsWith('.lnk') || lower.endsWith('.bat') || lower.endsWith('.cmd') || lower.endsWith('.msi')) {
    return 'app';
  }
  return 'file';
}

function displayName(p, kind) {
  const base = path.basename(p);
  if (kind === 'app' && base.toLowerCase().endsWith('.exe')) {
    return base.slice(0, -4);
  }
  if (base.toLowerCase().endsWith('.lnk')) return base.slice(0, -4);
  return base;
}

/** True when every character of `q` appears in `hay` in order ("nptd" → notepad). */
function subsequenceMatch(hay, q) {
  let i = 0;
  for (const ch of hay) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

/**
 * Launcher-style ranking: exact/name matches beat path matches beat fuzzy hits,
 * and frequently/recently opened items float to the top.
 */
function searchScore(item, q, historyEntry) {
  const name = String(item.name || '').toLowerCase();
  const p = String(item.path || '').toLowerCase();
  let score = 0;
  if (name === q) score = 200;
  else if (name.startsWith(q)) score = 140;
  else if (name.includes(q)) score = 100;
  else if (p.includes(q)) score = 40;
  else if (q.length >= 2 && subsequenceMatch(name, q)) score = 25;
  if (!score) return 0;
  if (historyEntry) {
    score += Math.min(historyEntry.openCount || 0, 20) * 2;
    const age = Date.now() - Date.parse(historyEntry.lastOpened || 0);
    if (age >= 0 && age < 7 * 24 * 3600 * 1000) score += 10;
  }
  return score;
}

module.exports = { Store, dataDir, setDataDirPointer, searchScore, subsequenceMatch };
