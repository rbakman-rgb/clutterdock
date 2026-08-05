/* global slaveDock */

let snapshot = null;
const $ = (id) => document.getElementById(id);

async function load() {
  snapshot = await slaveDock.getSnapshot();
  $('closeAfter').checked = !!snapshot.prefs.closeAfterLaunch;
  $('hints').checked = !!snapshot.prefs.showKeyboardHints;
  $('login').checked = !!snapshot.prefs.launchAtLogin;
  $('hotkey').value = snapshot.prefs.hotkey || 'CommandOrControl+Shift+D';
  $('version').textContent = `Version 1.0.0 · Data: ${snapshot.dataDir}`;
}

async function savePrefs(partial) {
  snapshot = await slaveDock.updatePrefs(partial);
  $('status').textContent = 'Saved.';
}

$('closeAfter').onchange = (e) => savePrefs({ closeAfterLaunch: e.target.checked });
$('hints').onchange = (e) => savePrefs({ showKeyboardHints: e.target.checked });
$('login').onchange = (e) => savePrefs({ launchAtLogin: e.target.checked });
$('hotkey').onchange = (e) => savePrefs({ hotkey: e.target.value.trim() || 'CommandOrControl+Shift+D' });

$('resetTips').onclick = () => savePrefs({ hasCompletedOnboarding: false });

$('exportBtn').onclick = async () => {
  const res = await slaveDock.exportPack();
  $('status').textContent = res.ok ? `Exported: ${res.path}` : 'Export cancelled.';
};
$('importReplace').onclick = async () => {
  snapshot = await slaveDock.importPack(false);
  $('status').textContent = 'Imported (replace).';
};
$('importMerge').onclick = async () => {
  snapshot = await slaveDock.importPack(true);
  $('status').textContent = 'Imported (merge).';
};

$('coffee').onclick = () => slaveDock.openExternal('https://buymeacoffee.com/chidichidovsky');
$('dataDir').onclick = async () => {
  // open folder via reveal of a dummy - use openExternal file URL
  if (snapshot?.dataDir) {
    await slaveDock.openExternal('file://' + snapshot.dataDir.replace(/\\/g, '/'));
  }
};

slaveDock.onSnapshot((data) => {
  snapshot = data;
});

load();
