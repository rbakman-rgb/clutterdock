const { dialog, shell, app } = require('electron');
const path = require('path');

const RELEASES_URL = 'https://github.com/rbakman-rgb/clutterdock/releases/latest';

function currentVersion() {
  try {
    return require(path.join(__dirname, '..', 'package.json')).version;
  } catch {
    return app.getVersion();
  }
}

function parse(v) {
  // Prerelease suffixes (1.2.0-beta.1) must not count as extra version parts,
  // or prereleases would compare as newer than the stable they precede.
  return String(v || '0')
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((p) => parseInt(String(p).replace(/\D/g, ''), 10) || 0);
}

function isNewer(remote, local) {
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv !== lv) return rv > lv;
  }
  return false;
}

/**
 * Windows auto-update via electron-updater + GitHub Releases.
 * Best with NSIS install; portable builds fall back to releases page.
 */
function setupUpdater({ onStatus, getParentWindow }) {
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.warn('electron-updater not available', e);
    return {
      check: async (interactive) => {
        if (interactive) {
          shell.openExternal(RELEASES_URL);
        }
        return { ok: false, error: 'Updater module missing' };
      },
    };
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // Parent dialogs to a live window when one exists so they can't open behind the app
  function showBox(opts) {
    const parent = getParentWindow?.();
    return parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts);
  }

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'rbakman-rgb',
    repo: 'clutterdock',
  });

  autoUpdater.on('error', (err) => {
    console.error('Updater error', err);
    onStatus?.(String(err?.message || err));
  });
  autoUpdater.on('download-progress', (p) => {
    onStatus?.(`Downloading… ${Math.round(p.percent || 0)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    onStatus?.(`Downloaded ${info.version}`);
    showBox({
        type: 'info',
        title: 'Update ready',
        message: `ClutterDock ${info.version} was downloaded.`,
        detail: 'Restart now to install? Your folders and Pro license stay on this PC.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true);
      })
      .catch(() => {});
  });

  async function check(interactive) {
    const local = currentVersion();
    try {
      const result = await autoUpdater.checkForUpdates();
      const remote = result?.updateInfo?.version;
      const available =
        typeof result?.isUpdateAvailable === 'boolean'
          ? result.isUpdateAvailable
          : Boolean(remote && isNewer(remote, local));

      if (available) {
        if (interactive) {
          const { response } = await showBox({
            type: 'info',
            title: 'Update available',
            message: `ClutterDock ${remote} is available.`,
            detail: `You have ${local}. Download and install now?\n\n(NSIS installs update in-app. Portable builds should use the releases page.)`,
            buttons: ['Download', 'Open releases page', 'Later'],
            defaultId: 0,
            cancelId: 2,
          });
          if (response === 0) {
            onStatus?.('Downloading update…');
            await autoUpdater.downloadUpdate();
            return { ok: true, downloading: true, version: remote };
          }
          if (response === 1) {
            shell.openExternal(RELEASES_URL);
          }
          return { ok: true, available: true, version: remote };
        }

        // Background check: never interrupt the user with a modal — just record
        // the status; Settings → Check for Updates shows the interactive flow.
        onStatus?.(`Update ${remote} available — Settings → Check for Updates`);
        return { ok: true, available: true, version: remote };
      }

      if (interactive) {
        await showBox({
          type: 'info',
          title: 'You’re up to date',
          message: `ClutterDock ${local} is the latest release.`,
          buttons: ['OK'],
        });
      }
      return { ok: true, available: false };
    } catch (e) {
      console.error(e);
      if (interactive) {
        const { response } = await showBox({
          type: 'warning',
          title: 'Couldn’t check for updates',
          message: String(e.message || e),
          detail:
            'Packaged NSIS installs update via GitHub Releases (needs latest.yml on the release). You can always download manually.',
          buttons: ['Open releases', 'OK'],
          defaultId: 0,
          cancelId: 1,
        });
        if (response === 0) {
          shell.openExternal(RELEASES_URL);
        }
      }
      return { ok: false, error: String(e.message || e) };
    }
  }

  return { check, autoUpdater };
}

module.exports = { setupUpdater };
