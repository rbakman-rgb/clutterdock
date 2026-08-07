/* global clutterDock */

let snapshot = null;
const $ = (id) => document.getElementById(id);

// Default drop behaviour navigates the window to the dropped URL — never allow it.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

async function load() {
  snapshot = await clutterDock.getSnapshot();
  $('closeAfter').checked = !!snapshot.prefs.closeAfterLaunch;
  $('hints').checked = !!snapshot.prefs.showKeyboardHints;
  $('login').checked = !!snapshot.prefs.launchAtLogin;
  $('hotkey').value = snapshot.prefs.hotkey || 'CommandOrControl+Shift+D';
  if ($('autoUpdate')) {
    $('autoUpdate').checked = snapshot.prefs.checkForUpdatesAutomatically !== false;
  }
  const tier = snapshot.license?.isPro ? 'Pro' : 'Free';
  const ver = (await clutterDock.getUpdateStatus?.())?.version || '—';
  $('version').textContent = `Version ${ver} · ${tier} · ${snapshot.dataDir}`;
  if ($('updateHint')) $('updateHint').textContent = `Installed ${ver}`;
  $('proStatus').textContent = snapshot.license?.isPro
    ? `You’re on Pro (${snapshot.license.display || 'active'})`
    : 'ClutterDock Free — upgrade anytime';
  $('exportBtn').textContent = snapshot.gate?.canExportPack ? 'Export pack…' : 'Export pack… (Pro)';
  renderWorkspaces();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function wsCall(promise) {
  const res = await promise;
  snapshot = res.snapshot || res;
  if (res && res.ok === false && res.error) $('status').textContent = res.error;
  renderWorkspaces();
}

function renderWorkspaces() {
  const list = $('wsList');
  if (!list) return;
  const isPro = !!snapshot?.gate?.canUseWorkspaces;
  $('wsAdd').disabled = !isPro;
  if (!isPro) {
    list.innerHTML = '<p class="status">Workspaces are included in ClutterDock Pro.</p>';
    return;
  }
  const workspaces = snapshot.state.workspaces || [];
  const folders = (snapshot.state.folders || []).filter((f) => f.smartKind === 'none');
  const activeID = snapshot.state.activeWorkspaceID || workspaces[0]?.id;
  list.innerHTML = '';
  for (const ws of workspaces) {
    const row = document.createElement('div');
    row.className = 'ws-row';
    const ids = new Set(ws.folderIDs || []);
    row.innerHTML = `
      <div class="ws-row-head">
        <input type="text" class="ws-name" value="${escapeHtml(ws.name)}" aria-label="Workspace name" />
        <button class="btn secondary ws-activate">${ws.id === activeID ? 'Active' : 'Activate'}</button>
        ${workspaces.length > 1 ? '<button class="btn secondary ws-delete">Delete</button>' : ''}
      </div>
      <div class="ws-folders">
        ${folders
          .map(
            (f) => `<label class="ws-folder"><input type="checkbox" data-fid="${f.id}" ${
              ids.has(f.id) ? 'checked' : ''
            } /> ${escapeHtml(f.name)}</label>`
          )
          .join('')}
      </div>`;
    const nameInput = row.querySelector('.ws-name');
    nameInput.onchange = () => wsCall(clutterDock.renameWorkspace(ws.id, nameInput.value));
    row.querySelector('.ws-activate').onclick = () => wsCall(clutterDock.selectWorkspace(ws.id));
    const del = row.querySelector('.ws-delete');
    if (del) del.onclick = () => wsCall(clutterDock.deleteWorkspace(ws.id));
    row.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.onchange = () => wsCall(clutterDock.toggleWorkspaceFolder(ws.id, cb.dataset.fid));
    });
    list.appendChild(row);
  }
}

async function savePrefs(partial) {
  const res = await clutterDock.updatePrefs(partial);
  snapshot = res.snapshot || res;
  $('status').textContent = res.hotkeyError || 'Saved.';
  await load();
}

$('closeAfter').onchange = (e) => savePrefs({ closeAfterLaunch: e.target.checked });
$('hints').onchange = (e) => savePrefs({ showKeyboardHints: e.target.checked });
$('login').onchange = (e) => savePrefs({ launchAtLogin: e.target.checked });
$('hotkey').onchange = (e) => savePrefs({ hotkey: e.target.value.trim() || 'CommandOrControl+Shift+D' });

$('resetTips').onclick = () => savePrefs({ hasCompletedOnboarding: false });
if ($('autoUpdate')) {
  $('autoUpdate').onchange = (e) => savePrefs({ checkForUpdatesAutomatically: e.target.checked });
}
if ($('checkUpdates')) {
  $('checkUpdates').onclick = async () => {
    $('status').textContent = 'Checking for updates…';
    const res = await clutterDock.checkForUpdates(true);
    if (res?.ok && !res.available && !res.downloading) {
      $('status').textContent = 'You’re on the latest version.';
    } else if (res?.downloading) {
      $('status').textContent = 'Downloading update…';
    } else if (res?.error) {
      $('status').textContent = res.error;
    } else {
      $('status').textContent = res?.available ? 'Update available.' : 'Update check finished.';
    }
  };
}

$('activatePro').onclick = async () => {
  const key = $('licenseKey').value;
  const res = await clutterDock.activateLicense(key);
  if (res.ok) {
    snapshot = res.snapshot;
    $('status').textContent = 'Pro activated — thank you!';
    $('licenseKey').value = '';
    await load();
  } else {
    $('status').textContent = res.error || 'Invalid key.';
  }
};

$('deactivatePro').onclick = async () => {
  const res = await clutterDock.deactivateLicense();
  snapshot = res.snapshot || res;
  $('status').textContent = 'Pro deactivated.';
  await load();
};

$('exportBtn').onclick = async () => {
  const res = await clutterDock.exportPack();
  if (res.ok) $('status').textContent = `Exported: ${res.path}`;
  else $('status').textContent = res.error || 'Export cancelled.';
};
async function runImport(merge) {
  const res = await clutterDock.importPack(merge);
  if (res?.ok) {
    snapshot = res.snapshot;
    $('status').textContent = merge ? 'Imported (merge).' : 'Imported (replace).';
    await load();
  } else {
    $('status').textContent = res?.error || 'Import cancelled.';
  }
}
$('importReplace').onclick = () => runImport(false);
$('importMerge').onclick = () => runImport(true);

$('wsAdd').onclick = () => wsCall(clutterDock.addWorkspace(`Workspace ${(snapshot?.state?.workspaces?.length || 0) + 1}`));

$('coffee').onclick = () => clutterDock.openExternal('https://buymeacoffee.com/chidichidovsky');
$('dataDir').onclick = () => clutterDock.openDataDir();

clutterDock.onSnapshot((data) => {
  snapshot = data;
});

load();
