const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('clutterDock', {
  // File.path was removed in Electron 32; drops must resolve paths via webUtils.
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || null;
    } catch (_) {
      return null;
    }
  },
  getSnapshot: () => ipcRenderer.invoke('get-snapshot'),
  onSnapshot: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('snapshot', handler);
    return () => ipcRenderer.removeListener('snapshot', handler);
  },
  selectFolder: (id) => ipcRenderer.invoke('select-folder', id),
  addFolder: (name, symbol) => ipcRenderer.invoke('add-folder', name, symbol),
  renameFolder: (id, name) => ipcRenderer.invoke('rename-folder', id, name),
  setFolderSymbol: (id, symbol) => ipcRenderer.invoke('set-folder-symbol', id, symbol),
  deleteFolder: (id) => ipcRenderer.invoke('delete-folder', id),
  setFolderView: (id, mode) => ipcRenderer.invoke('set-folder-view', id, mode),
  setFolderSort: (id, mode) => ipcRenderer.invoke('set-folder-sort', id, mode),
  pickAndAdd: () => ipcRenderer.invoke('pick-and-add'),
  addPaths: (paths, folderID) => ipcRenderer.invoke('add-paths', paths, folderID),
  addURL: (url, folderID) => ipcRenderer.invoke('add-url', url, folderID),
  removeItem: (itemID, folderID) => ipcRenderer.invoke('remove-item', itemID, folderID),
  reorderItem: (itemID, toIndex, folderID) =>
    ipcRenderer.invoke('reorder-item', itemID, toIndex, folderID),
  relocateItem: (itemID, folderID) => ipcRenderer.invoke('relocate-item', itemID, folderID),
  nudgeItem: (itemID, delta, folderID) => ipcRenderer.invoke('nudge-item', itemID, delta, folderID),
  openItem: (item) => ipcRenderer.invoke('open-item', item),
  revealItem: (item) => ipcRenderer.invoke('reveal-item', item),
  searchAll: (query) => ipcRenderer.invoke('search-all', query),
  updatePrefs: (partial) => ipcRenderer.invoke('update-prefs', partial),
  registerInstall: (email) => ipcRenderer.invoke('register-install', email),
  exportPack: () => ipcRenderer.invoke('export-pack'),
  importPack: (merge) => ipcRenderer.invoke('import-pack', merge),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  hidePanel: () => ipcRenderer.invoke('hide-panel'),
  showPanel: () => ipcRenderer.invoke('show-panel'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openDataDir: () => ipcRenderer.invoke('open-data-dir'),
  getItemIcon: (itemID) => ipcRenderer.invoke('get-item-icon', itemID),
  selectWorkspace: (id) => ipcRenderer.invoke('select-workspace', id),
  addWorkspace: (name) => ipcRenderer.invoke('add-workspace', name),
  renameWorkspace: (id, name) => ipcRenderer.invoke('rename-workspace', id, name),
  deleteWorkspace: (id) => ipcRenderer.invoke('delete-workspace', id),
  toggleWorkspaceFolder: (workspaceID, folderID) =>
    ipcRenderer.invoke('toggle-workspace-folder', workspaceID, folderID),
  lockFolder: (folderID, password) => ipcRenderer.invoke('lock-folder', folderID, password),
  unlockFolder: (folderID, password) => ipcRenderer.invoke('unlock-folder', folderID, password),
  relockFolder: (folderID) => ipcRenderer.invoke('relock-folder', folderID),
  removeFolderLock: (folderID) => ipcRenderer.invoke('remove-folder-lock', folderID),
  pickFolderImage: (folderID) => ipcRenderer.invoke('pick-folder-image', folderID),
  clearFolderImage: (folderID) => ipcRenderer.invoke('clear-folder-image', folderID),
  getFolderImage: (folderID) => ipcRenderer.invoke('get-folder-image', folderID),
  onRunningPaths: (cb) => {
    const handler = (_e, paths) => cb(paths);
    ipcRenderer.on('running-paths', handler);
    return () => ipcRenderer.removeListener('running-paths', handler);
  },
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  deactivateLicense: () => ipcRenderer.invoke('deactivate-license'),
  checkForUpdates: (interactive) => ipcRenderer.invoke('check-for-updates', interactive),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
});
