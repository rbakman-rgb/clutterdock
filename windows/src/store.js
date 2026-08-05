const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { randomUUID } = require('crypto');
const {
  validate: validateLicense,
  mask: maskLicense,
  createFeatureGate,
  TEST_KEY,
} = require('./license');

const CURRENT_VERSION = 1;

function dataDir() {
  const dir = path.join(app.getPath('userData'), 'SlaveDock');
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
  };
}

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  } catch (e) {
    console.error('SlaveDock load error', file, e);
  }
  return fallback;
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('SlaveDock save error', file, e);
  }
}

class Store {
  constructor() {
    this.state = loadJSON(configPath(), defaultState());
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
      license: {
        isPro: this.isPro,
        display: this.isPro ? maskLicense(this.prefs.licenseKey) : '',
        testKey: TEST_KEY,
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

  addFolder(name) {
    const count = this.normalFolderCount();
    if (!this.gate.canAddFolder(count)) {
      return { ok: false, hitLimit: true, message: this.gate.folderLimitMessage(count) };
    }
    const folder = {
      id: randomUUID(),
      name: (name || 'Folder').trim() || 'Folder',
      items: [],
      symbol: 'folder',
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
    if (!s.includes('://')) s = 'https://' + s;
    try {
      // eslint-disable-next-line no-new
      new URL(s);
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
    this.history.entries = entries.slice(0, 40);
    this.persistHistory();
  }

  recentItems() {
    const lim = this.gate.historyLimit;
    return this.history.entries.slice(0, lim).map((e) => ({
      id: e.id,
      kind: e.kind,
      path: e.path,
      name: e.name,
    }));
  }

  displayItems(folder) {
    if (!folder) return [];
    if (folder.smartKind === 'recents') return this.recentItems();
    let items = [...(folder.items || [])];
    if (folder.sortMode === 'nameAZ') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else if (folder.sortMode === 'nameZA') {
      items.sort((a, b) => b.name.localeCompare(a.name));
    } else if (folder.sortMode === 'kind') {
      items.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    }
    return items;
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
      throw new Error('Pack export requires SlaveDock Pro.');
    }
    return JSON.stringify(this.state, null, 2);
  }

  importPack(json, merge) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data.folders?.length) throw new Error('Empty pack');
    if (merge) {
      for (const folder of data.folders) {
        if (folder.smartKind && folder.smartKind !== 'none') continue;
        const existing = this.state.folders.find(
          (f) => f.name === folder.name && f.smartKind === 'none'
        );
        if (existing) {
          this.addPaths(
            (folder.items || []).filter((i) => i.kind !== 'url').map((i) => i.path),
            existing.id
          );
          for (const i of folder.items || []) {
            if (i.kind === 'url') this.addURL(i.path, existing.id);
          }
        } else {
          this.state.folders.push({
            ...folder,
            id: randomUUID(),
            items: (folder.items || []).map((i) => ({ ...i, id: randomUUID() })),
          });
        }
      }
    } else {
      this.state = {
        version: CURRENT_VERSION,
        folders: data.folders,
        selectedFolderID: data.selectedFolderID || data.folders[0]?.id,
        workspaces: data.workspaces || this.state.workspaces,
        activeWorkspaceID: data.activeWorkspaceID || null,
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
