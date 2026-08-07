/* global clutterDock */

let snapshot = null;
const $ = (id) => document.getElementById(id);

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
  const ver = (await clutterDock.getUpdateStatus?.())?.version || '1.1.1';
  $('version').textContent = `Version ${ver} · ${tier} · ${snapshot.dataDir}`;
  if ($('updateHint')) $('updateHint').textContent = `Installed ${ver}`;
  $('proStatus').textContent = snapshot.license?.isPro
    ? `You’re on Pro (${snapshot.license.display || 'active'})`
    : 'ClutterDock Free — upgrade anytime';
  $('exportBtn').textContent = snapshot.gate?.canExportPack ? 'Export pack…' : 'Export pack… (Pro)';
}

async function savePrefs(partial) {
  snapshot = await clutterDock.updatePrefs(partial);
  $('status').textContent = 'Saved.';
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
  snapshot = await clutterDock.deactivateLicense();
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

$('coffee').onclick = () => clutterDock.openExternal('https://buymeacoffee.com/chidichidovsky');
$('dataDir').onclick = async () => {
  if (snapshot?.dataDir) {
    await clutterDock.openExternal('file://' + snapshot.dataDir.replace(/\\/g, '/'));
  }
};

clutterDock.onSnapshot((data) => {
  snapshot = data;
});

load();
