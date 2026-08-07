const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { randomUUID } = require('crypto');
const {
  validate: validateLicense,
  mask: maskLicense,
  createFeatureGate,
  PRO_HISTORY,
} = require('./license');

const CURRENT_VERSION = 1;

function dataDir() {
  const root = app.getPath('userData');
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
  return dir;
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
    licenseKey: '',
    themeAccent: 'system',
    checkForUpdatesAutomatically: true,
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
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
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
    this._ensureSmartFolders();
  }

  get isPro() {
    return validateLicense(this.prefs.licenseKey || '');
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
      this.persist();
    }
  }

  persist() {
    this.state.version = CURRENT_VERSION;
    saveJSON(configPath(), this.state);
  }

  persistHistory() {
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
      dataDir: dataDir(),
      dataWarning: this.dataWarning,
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

  deleteFolder(id) {
    const f = this.state.folders.find((x) => x.id === id);
    if (!f) return;
    const normals = this.state.folders.filter((x) => x.smartKind === 'none');
    if (f.smartKind === 'none' && normals.length <= 1) return;
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

  addPaths(paths, folderID) {
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
      f.items.push({
        id: randomUUID(),
        kind,
        path: p,
        name: displayName(p, kind),
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
    if (!s.includes('://') && !s.toLowerCase().startsWith('mailto:')) s = 'https://' + s;
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
    const hits = [];
    for (const folder of this.state.folders) {
      if (folder.smartKind !== 'none') continue;
      for (const item of folder.items || []) {
        const hay = `${item.name} ${item.path}`.toLowerCase();
        if (hay.includes(q)) {
          hits.push({ item, folderName: folder.name, folderID: folder.id });
        }
      }
    }
    return hits;
  }

  exportPack() {
    if (!this.gate.canExportPack) {
      throw new Error('Pack export requires ClutterDock Pro.');
    }
    return JSON.stringify(this.state, null, 2);
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
    this.persist();
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
    folders.push({
      id: randomUUID(),
      name: ((typeof raw.name === 'string' && raw.name.trim()) || 'Stack').slice(0, 80),
      items,
      symbol: typeof raw.symbol === 'string' ? raw.symbol : 'folder',
      sortMode: PACK_SORT_MODES.has(raw.sortMode) ? raw.sortMode : 'manual',
      viewMode: raw.viewMode === 'list' ? 'list' : 'grid',
      smartKind: 'none',
    });
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

module.exports = { Store, dataDir };
