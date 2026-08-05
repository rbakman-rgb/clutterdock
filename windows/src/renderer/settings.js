/* global slaveDock */

let snapshot = null;
const $ = (id) => document.getElementById(id);

async function load() {
  snapshot = await slaveDock.getSnapshot();
  $('closeAfter').checked = !!snapshot.prefs.closeAfterLaunch;
  $('hints').checked = !!snapshot.prefs.showKeyboardHints;
  $('login').checked = !!snapshot.prefs.launchAtLogin;
  $('hotkey').value = snapshot.prefs.hotkey || 'CommandOrControl+Shift+D';
  const tier = snapshot.license?.isPro ? 'Pro' : 'Free';
  $('version').textContent = `Version 1.0.0 · ${tier} · ${snapshot.dataDir}`;
  $('proStatus').textContent = snapshot.license?.isPro
    ? `You’re on Pro (${snapshot.license.display || 'active'})`
    : 'SlaveDock Free — upgrade anytime';
  $('exportBtn').textContent = snapshot.gate?.canExportPack ? 'Export pack…' : 'Export pack… (Pro)';
}

async function savePrefs(partial) {
  snapshot = await slaveDock.updatePrefs(partial);
  $('status').textContent = 'Saved.';
  await load();
}

$('closeAfter').onchange = (e) => savePrefs({ closeAfterLaunch: e.target.checked });
$('hints').onchange = (e) => savePrefs({ showKeyboardHints: e.target.checked });
$('login').onchange = (e) => savePrefs({ launchAtLogin: e.target.checked });
$('hotkey').onchange = (e) => savePrefs({ hotkey: e.target.value.trim() || 'CommandOrControl+Shift+D' });

$('resetTips').onclick = () => savePrefs({ hasCompletedOnboarding: false });

$('activatePro').onclick = async () => {
  const key = $('licenseKey').value;
  const res = await slaveDock.activateLicense(key);
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
  snapshot = await slaveDock.deactivateLicense();
  $('status').textContent = 'Pro deactivated.';
  await load();
};

$('exportBtn').onclick = async () => {
  const res = await slaveDock.exportPack();
  if (res.ok) $('status').textContent = `Exported: ${res.path}`;
  else $('status').textContent = res.error || 'Export cancelled.';
};
$('importReplace').onclick = async () => {
  snapshot = await slaveDock.importPack(false);
  $('status').textContent = 'Imported (replace).';
  await load();
};
$('importMerge').onclick = async () => {
  snapshot = await slaveDock.importPack(true);
  $('status').textContent = 'Imported (merge).';
  await load();
};

$('coffee').onclick = () => slaveDock.openExternal('https://buymeacoffee.com/chidichidovsky');
$('dataDir').onclick = async () => {
  if (snapshot?.dataDir) {
    await slaveDock.openExternal('file://' + snapshot.dataDir.replace(/\\/g, '/'));
  }
};

slaveDock.onSnapshot((data) => {
  snapshot = data;
});

load();
