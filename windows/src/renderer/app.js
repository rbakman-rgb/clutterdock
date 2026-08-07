/* global clutterDock */

let snapshot = null;
let searchGlobal = false;
let searchText = '';
let selectedId = null;
let dragId = null;

const $ = (id) => document.getElementById(id);

const ICON = {
  app: '🟩',
  file: '📄',
  folder: '📁',
  url: '🔗',
};

function visibleFolders() {
  if (!snapshot) return [];
  const all = snapshot.state.folders || [];
  const ids = snapshot.visibleFolderIDs;
  if (!Array.isArray(ids)) return all;
  const map = new Map(all.map((f) => [f.id, f]));
  const list = ids.map((id) => map.get(id)).filter(Boolean);
  return list.length ? list : all;
}

function selectedFolder() {
  if (!snapshot) return null;
  const folders = visibleFolders();
  return (
    folders.find((f) => f.id === snapshot.state.selectedFolderID) ||
    folders[0] ||
    snapshot.state.folders[0]
  );
}

function itemsForView() {
  if (!snapshot) return [];
  const q = searchText.trim().toLowerCase();
  if (searchGlobal && q) {
    return (snapshot._globalHits || []).map((h) => ({
      ...h.item,
      _folderName: h.folderName,
    }));
  }
  const folder = selectedFolder();
  if (!folder) return [];
  let items;
  if (folder.smartKind === 'recents') {
    items = (snapshot.history || []).map((e) => ({
      id: e.id,
      kind: e.kind,
      path: e.path,
      name: e.name,
    }));
  } else {
    items = [...(folder.items || [])];
    if (folder.sortMode === 'nameAZ') items.sort((a, b) => a.name.localeCompare(b.name));
    if (folder.sortMode === 'nameZA') items.sort((a, b) => b.name.localeCompare(a.name));
    if (folder.sortMode === 'kind') {
      items.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    }
  }
  if (q && !searchGlobal) {
    items = items.filter((i) => `${i.name} ${i.path}`.toLowerCase().includes(q));
  }
  return items;
}

async function refresh(next) {
  snapshot = next || (await clutterDock.getSnapshot());
  if (searchGlobal && searchText.trim()) {
    snapshot._globalHits = await clutterDock.searchAll(searchText);
  } else {
    snapshot._globalHits = [];
  }
  render();
}

/**
 * Run a mutation IPC (returns { ok, snapshot, error?, limitMessage? }), refresh
 * from its snapshot, and surface limit hits with the Pro upsell dialog.
 */
async function call(promise) {
  const res = await promise;
  const snap = res && res.snapshot ? res.snapshot : res;
  await refresh(snap);
  if (res && res.limitMessage) upsellDialog(res.limitMessage);
  else if (res && res.ok === false && res.error) alert(res.error);
  return res;
}

// ---- Native file icons (data URLs from the main process; emoji fallback) ----

const iconMemo = new Map();

function hydrateIcon(container, item) {
  if (!container || item.kind === 'url') return;
  const cached = iconMemo.get(item.path);
  if (cached === null) return; // known to have no native icon
  if (typeof cached === 'string') {
    container.innerHTML = `<img src="${cached}" alt="" draggable="false" />`;
    return;
  }
  clutterDock.getItemIcon(item.id).then((url) => {
    iconMemo.set(item.path, url);
    if (url && container.isConnected) {
      container.innerHTML = `<img src="${url}" alt="" draggable="false" />`;
    }
  });
}

let dataWarningShown = false;

function render() {
  if (!snapshot) return;
  if (snapshot.dataWarning && !dataWarningShown) {
    dataWarningShown = true;
    alert(snapshot.dataWarning);
  }
  renderWorkspaceBar();
  renderTabs();
  renderContent();
  renderHints();
  renderOnboarding();
  const items = itemsForView();
  $('count').textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  $('searchAll').classList.toggle('on', searchGlobal);
}

const STACK_EMOJI = {
  grid: '▦',
  folder: '📁',
  coding: '💻',
  design: '🎨',
  work: '💼',
  personal: '🏠',
  media: '🖼',
  games: '🎮',
  client: '👥',
  admin: '✉️',
  clock: '🕐',
  star: '⭐',
};

const STACK_PRESETS = [
  { name: 'Coding', symbol: 'coding' },
  { name: 'Design', symbol: 'design' },
  { name: 'Work', symbol: 'work' },
  { name: 'Personal', symbol: 'personal' },
  { name: 'Media', symbol: 'media' },
  { name: 'Games', symbol: 'games' },
];

function stackLabel(f) {
  if (isLockedFolder(f)) return `🔒 ${f.name}`;
  const emoji = STACK_EMOJI[f.symbol] || STACK_EMOJI.folder;
  return `${emoji} ${f.name}`;
}

// Workspaces (Pro): chip bar shown only when the user has more than one
function renderWorkspaceBar() {
  const bar = $('wsbar');
  const workspaces = snapshot.state.workspaces || [];
  const show = snapshot.gate?.canUseWorkspaces && workspaces.length > 1;
  bar.hidden = !show;
  bar.innerHTML = '';
  if (!show) return;
  const activeID = snapshot.state.activeWorkspaceID || workspaces[0]?.id;
  for (const ws of workspaces) {
    const chip = document.createElement('button');
    chip.className = 'ws-chip' + (ws.id === activeID ? ' active' : '');
    chip.textContent = ws.name;
    chip.onclick = () => call(clutterDock.selectWorkspace(ws.id));
    bar.appendChild(chip);
  }
}

// Running-app indicators (Windows): lowercase exe paths pushed from main
let runningPathSet = new Set();
if (clutterDock.onRunningPaths) {
  clutterDock.onRunningPaths((paths) => {
    runningPathSet = new Set(paths || []);
    renderContent();
  });
}

function isRunning(item) {
  return item.kind === 'app' && runningPathSet.has(String(item.path || '').toLowerCase());
}

function renderTabs() {
  const tabs = $('tabs');
  const folders = visibleFolders();
  tabs.innerHTML = '';
  for (const f of folders) {
    const b = document.createElement('button');
    b.className = 'tab' + (f.id === snapshot.state.selectedFolderID ? ' active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', f.id === snapshot.state.selectedFolderID ? 'true' : 'false');
    b.textContent = stackLabel(f);
    if (f.customImage) {
      clutterDock.getFolderImage(f.id).then((url) => {
        if (url && b.isConnected) {
          b.innerHTML = `<img class="tab-img" src="${url}" alt="" draggable="false" /> ${escapeHtml(f.name)}`;
        }
      });
    }
    b.title =
      f.smartKind && f.smartKind !== 'none'
        ? `${f.name} (smart — drop on normal stacks only)`
        : `Drop apps/files here · click to open`;
    b.onclick = () => call(clutterDock.selectFolder(f.id));
    b.oncontextmenu = (e) => {
      e.preventDefault();
      showFolderMenu(e.clientX, e.clientY, f);
    };
    // Drop Finder/Explorer files or stack items onto a tab
    b.addEventListener('dragover', (e) => {
      if (f.smartKind && f.smartKind !== 'none') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
      b.classList.add('drop-target');
    });
    b.addEventListener('dragleave', () => b.classList.remove('drop-target'));
    b.addEventListener('drop', async (e) => {
      e.preventDefault();
      b.classList.remove('drop-target');
      if (f.smartKind && f.smartKind !== 'none') return;
      const itemId = e.dataTransfer.getData('text/plain') || dragId;
      const files = [...(e.dataTransfer.files || [])]
        .map((x) => clutterDock.pathForFile(x))
        .filter(Boolean);
      if (itemId && !files.length) {
        await call(clutterDock.relocateItem(itemId, f.id));
        dragId = null;
        return;
      }
      if (files.length) {
        await call(clutterDock.addPaths(files, f.id));
      }
    });
    tabs.appendChild(b);
  }
  const actions = document.createElement('div');
  actions.className = 'tab-actions';
  actions.innerHTML = `
    <button class="icon-btn" id="addFolderBtn" title="New stack" aria-label="New stack">📁+</button>
    <button class="icon-btn" id="addItemsBtn" title="Add items" aria-label="Add items">＋</button>
  `;
  tabs.appendChild(actions);
  $('addFolderBtn').onclick = async () => {
    const pick = await newStackDialog();
    if (!pick) return;
    await call(clutterDock.addFolder(pick.name, pick.symbol));
  };
  $('addItemsBtn').onclick = () => call(clutterDock.pickAndAdd());
  const badge = document.createElement('span');
  badge.className = 'tier-badge' + (snapshot.gate?.isPro ? ' pro' : '');
  badge.textContent = snapshot.gate?.isPro ? 'Pro' : 'Free';
  tabs.appendChild(badge);
}

function renderContent() {
  const content = $('content');
  const folder = selectedFolder();
  const items = itemsForView();
  content.classList.remove('drop-active');

  if (isLockedFolder(folder)) {
    content.innerHTML = `
      <div class="empty">
        <div style="font-size:36px">🔒</div>
        <h3>“${escapeHtml(folder.name)}” is locked</h3>
        <p>This stack’s contents are encrypted on this PC.</p>
        <div class="actions"><button class="btn primary" id="unlockBtn">Unlock…</button></div>
      </div>`;
    $('unlockBtn').onclick = () => unlockStack(folder);
    return;
  }

  if (!items.length) {
    const isSmart = folder && folder.smartKind !== 'none';
    content.innerHTML = `
      <div class="empty">
        <div style="font-size:36px">${isSmart ? '🕒' : '📦'}</div>
        <h3>${emptyTitle(folder)}</h3>
        <p>${emptySub(folder)}</p>
        ${
          !isSmart
            ? `<div class="actions">
                <button class="btn primary" id="emptyAdd">Add apps…</button>
                <button class="btn secondary" id="emptyUrl">Add URL…</button>
              </div>`
            : ''
        }
      </div>`;
    $('emptyAdd')?.addEventListener('click', async () => {
      await call(clutterDock.pickAndAdd());
    });
    $('emptyUrl')?.addEventListener('click', addUrlPrompt);
    return;
  }

  const viewMode = folder?.viewMode || 'grid';
  if (viewMode === 'list' || (searchGlobal && searchText.trim())) {
    content.innerHTML = `<div class="list" id="list"></div>`;
    const list = $('list');
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'list-row' + (item.id === selectedId ? ' selected' : '');
      row.innerHTML = `
        <div class="tile-icon ${item.kind}">${ICON[item.kind] || '📄'}</div>
        <div class="meta">
          <div class="name">${escapeHtml(item.name)}${isRunning(item) ? ' <span class="run-dot" aria-hidden="true"></span>' : ''}</div>
          <div class="sub">${escapeHtml(item._folderName || item.kind + ' · ' + item.path)}</div>
        </div>`;
      wireItem(row, item, folder);
      hydrateIcon(row.querySelector('.tile-icon'), item);
      list.appendChild(row);
    }
  } else {
    content.innerHTML = `<div class="grid" id="grid"></div>`;
    const grid = $('grid');
    for (const item of items) {
      const tile = document.createElement('div');
      tile.className = 'tile' + (item.id === selectedId ? ' selected' : '');
      tile.draggable = folder?.smartKind === 'none';
      tile.innerHTML = `
        <div class="tile-icon ${item.kind}">${ICON[item.kind] || '📄'}</div>
        ${isRunning(item) ? '<span class="run-dot" aria-hidden="true"></span>' : ''}
        <div class="tile-name">${escapeHtml(item.name)}</div>`;
      wireItem(tile, item, folder);
      hydrateIcon(tile.querySelector('.tile-icon'), item);
      if (folder?.smartKind === 'none') {
        tile.addEventListener('dragstart', (e) => {
          dragId = item.id;
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.effectAllowed = 'move';
        });
        tile.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        });
        tile.addEventListener('drop', async (e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData('text/plain') || dragId;
          if (!from || from === item.id) return;
          const ids = items.map((i) => i.id);
          const toIndex = ids.indexOf(item.id);
          await call(clutterDock.reorderItem(from, toIndex, folder.id));
          selectedId = from;
          dragId = null;
        });
      }
      grid.appendChild(tile);
    }
  }
}

function wireItem(el, item, folder) {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `${item.name}, ${item.kind}${isRunning(item) ? ', running' : ''}`);
  el.onclick = async () => {
    selectedId = item.id;
    renderContent();
    const res = await clutterDock.openItem(item);
    if (!res?.ok && res?.error) alert(res.error);
    else await refresh();
  };
  el.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.onclick();
    }
  };
  el.oncontextmenu = (e) => {
    e.preventDefault();
    selectedId = item.id;
    showItemMenu(e.clientX, e.clientY, item, folder);
  };
}

function emptyTitle(folder) {
  if (folder?.smartKind === 'recents') return 'No recent launches yet';
  return 'This folder is empty';
}
function emptySub(folder) {
  if (folder?.smartKind === 'recents') {
    return 'Open items from your folders — they will show up here.';
  }
  return 'Drop apps, files, or folders here — or use ＋ to add them.';
}

function renderHints() {
  const hints = $('hints');
  if (!snapshot.prefs.showKeyboardHints) {
    hints.textContent = '';
    return;
  }
  hints.textContent =
    '↑↓←→ move · Enter open · Esc close · Ctrl+Shift+D toggle · Ctrl+G all folders' +
    (snapshot.gate?.isPro ? ' · Ctrl+Shift+1–9 stacks' : '');
}

function renderOnboarding() {
  const overlay = $('overlay');
  if (snapshot.prefs.hasCompletedOnboarding) {
    overlay.hidden = true;
    overlay.innerHTML = '';
    return;
  }
  overlay.hidden = false;
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="card">
      <h2>✨ Welcome to ClutterDock</h2>
      <ol>
        <li>Create stacks (Coding, Work…) with a name &amp; symbol</li>
        <li>Drop apps, files, or URLs into each stack</li>
        <li>Tray icon or <b>Ctrl+Shift+D</b> · right‑click a tab to customize</li>
        <li>Free forever — tips optional via Buy Me a Coffee</li>
      </ol>
      <div class="row">
        <button class="btn primary" id="obAdd">Add apps…</button>
        <button class="btn secondary" id="obSettings">Settings</button>
        <button class="btn secondary" id="obGot">Got it</button>
      </div>
    </div>`;
  $('obGot').onclick = async () => {
    await call(clutterDock.updatePrefs({ hasCompletedOnboarding: true }));
  };
  $('obAdd').onclick = async () => {
    await clutterDock.updatePrefs({ hasCompletedOnboarding: true });
    await call(clutterDock.pickAndAdd());
  };
  $('obSettings').onclick = async () => {
    await clutterDock.updatePrefs({ hasCompletedOnboarding: true });
    await clutterDock.openSettings();
  };
}

// ---- In-panel dialogs (Electron does not implement window.prompt) ----

let modalResolve = null;

function modalOpen() {
  return !$('modal').hidden;
}

function closeModal(value) {
  const modal = $('modal');
  modal.hidden = true;
  modal.innerHTML = '';
  const resolve = modalResolve;
  modalResolve = null;
  if (resolve) resolve(value);
}

function openModal(build) {
  if (modalOpen()) closeModal(null);
  const modal = $('modal');
  modal.hidden = false;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal(null);
  };
  return new Promise((resolve) => {
    modalResolve = resolve;
    build(modal);
  });
}

function textDialog({ title, sub = '', value = '', placeholder = '', submitLabel = 'OK' }) {
  return openModal((modal) => {
    modal.innerHTML = `
      <div class="card dialog">
        <h2>${escapeHtml(title)}</h2>
        ${sub ? `<p class="dialog-sub">${escapeHtml(sub)}</p>` : ''}
        <input type="text" id="dlgInput" autocomplete="off" spellcheck="false" />
        <div class="row">
          <button class="btn primary" id="dlgOk">${escapeHtml(submitLabel)}</button>
          <button class="btn secondary" id="dlgCancel">Cancel</button>
        </div>
      </div>`;
    const input = $('dlgInput');
    input.value = value;
    input.placeholder = placeholder;
    const submit = () => closeModal(input.value.trim() || null);
    $('dlgOk').onclick = submit;
    $('dlgCancel').onclick = () => closeModal(null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') submit();
    };
    input.focus();
    input.select();
  });
}

function buildSymbolGrid(container, initial, onPick) {
  let selected = initial;
  for (const key of Object.keys(STACK_EMOJI)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'symbol-btn' + (key === selected ? ' selected' : '');
    b.textContent = STACK_EMOJI[key];
    b.title = key;
    b.setAttribute('aria-label', key);
    b.onclick = () => {
      selected = key;
      [...container.children].forEach((c) => c.classList.toggle('selected', c === b));
      onPick(key);
    };
    container.appendChild(b);
  }
  return {
    select(key) {
      selected = key;
      [...container.children].forEach((c) => c.classList.toggle('selected', c.title === key));
    },
  };
}

function newStackDialog() {
  return openModal((modal) => {
    modal.innerHTML = `
      <div class="card dialog">
        <h2>New stack</h2>
        <input type="text" id="dlgInput" placeholder="Name (e.g. Coding, Work)" autocomplete="off" spellcheck="false" />
        <div class="preset-row" id="dlgPresets"></div>
        <div class="symbol-grid" id="dlgSymbols"></div>
        <div class="row">
          <button class="btn primary" id="dlgOk">Create</button>
          <button class="btn secondary" id="dlgCancel">Cancel</button>
        </div>
      </div>`;
    const input = $('dlgInput');
    let symbol = 'folder';
    const grid = buildSymbolGrid($('dlgSymbols'), symbol, (key) => {
      symbol = key;
    });
    for (const p of STACK_PRESETS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'preset-chip';
      chip.textContent = `${STACK_EMOJI[p.symbol]} ${p.name}`;
      chip.onclick = () => {
        input.value = p.name;
        symbol = p.symbol;
        grid.select(p.symbol);
        input.focus();
      };
      $('dlgPresets').appendChild(chip);
    }
    const submit = () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      closeModal({ name, symbol });
    };
    $('dlgOk').onclick = submit;
    $('dlgCancel').onclick = () => closeModal(null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') submit();
    };
    input.focus();
  });
}

function isLockedFolder(folder) {
  return !!(folder && (snapshot.lockedFolderIDs || []).includes(folder.id));
}

/** Password entry. `confirm` asks twice for a new password. */
function passwordDialog({ title, sub, submitLabel = 'Unlock', confirm = false }) {
  return openModal((modal) => {
    modal.innerHTML = `
      <div class="card dialog">
        <h2>${escapeHtml(title)}</h2>
        ${sub ? `<p class="dialog-sub">${escapeHtml(sub)}</p>` : ''}
        <input type="password" id="dlgPw" placeholder="Password" autocomplete="off" />
        ${confirm ? '<input type="password" id="dlgPw2" placeholder="Confirm password" autocomplete="off" />' : ''}
        <p class="dialog-error" id="dlgErr" hidden></p>
        <div class="row">
          <button class="btn primary" id="dlgOk">${escapeHtml(submitLabel)}</button>
          <button class="btn secondary" id="dlgCancel">Cancel</button>
        </div>
      </div>`;
    const pw = $('dlgPw');
    const pw2 = confirm ? $('dlgPw2') : null;
    const err = $('dlgErr');
    const submit = () => {
      const value = pw.value;
      if (!value) {
        err.textContent = 'Enter a password.';
        err.hidden = false;
        return;
      }
      if (pw2 && value !== pw2.value) {
        err.textContent = 'Those passwords didn’t match.';
        err.hidden = false;
        return;
      }
      closeModal(value);
    };
    $('dlgOk').onclick = submit;
    $('dlgCancel').onclick = () => closeModal(null);
    for (const el of [pw, pw2].filter(Boolean)) {
      el.onkeydown = (e) => {
        if (e.key === 'Enter') submit();
      };
    }
    pw.focus();
  });
}

async function lockStack(folder) {
  if (!snapshot?.gate?.isPro) {
    upsellDialog('Password-protected stacks are a Pro feature.');
    return;
  }
  const password = await passwordDialog({
    title: `Lock “${folder.name}”`,
    sub: 'This stack’s items are encrypted on this PC and hidden until you enter this password. There is no way to recover them if you forget it.',
    submitLabel: 'Lock',
    confirm: true,
  });
  if (password) await call(clutterDock.lockFolder(folder.id, password));
}

async function unlockStack(folder) {
  const password = await passwordDialog({
    title: `Unlock “${folder.name}”`,
    sub: 'Enter the password for this stack.',
  });
  if (password) await call(clutterDock.unlockFolder(folder.id, password));
}

function upsellDialog(message) {
  return openModal((modal) => {
    modal.innerHTML = `
      <div class="card dialog">
        <h2>ClutterDock Pro</h2>
        <p class="dialog-sub">${escapeHtml(message)}</p>
        <p class="dialog-sub">Pro is a one-time unlock: unlimited stacks &amp; items, global search, pack export.</p>
        <div class="row">
          <button class="btn primary" id="dlgOk">Open Settings → Pro</button>
          <button class="btn secondary" id="dlgCancel">Not now</button>
        </div>
      </div>`;
    $('dlgOk').onclick = () => {
      closeModal(null);
      clutterDock.openSettings();
    };
    $('dlgCancel').onclick = () => closeModal(null);
    $('dlgOk').focus();
  });
}

function symbolDialog(folderName, current) {
  return openModal((modal) => {
    modal.innerHTML = `
      <div class="card dialog">
        <h2>Symbol for “${escapeHtml(folderName)}”</h2>
        <div class="symbol-grid" id="dlgSymbols"></div>
        <div class="row">
          <button class="btn secondary" id="dlgCancel">Cancel</button>
        </div>
      </div>`;
    buildSymbolGrid($('dlgSymbols'), current || 'folder', (key) => closeModal(key));
    $('dlgCancel').onclick = () => closeModal(null);
  });
}

// Keep the fixed-position context menu inside the panel bounds
function placeCtx(ctx, x, y) {
  ctx.style.visibility = 'hidden';
  ctx.hidden = false;
  const { offsetWidth: w, offsetHeight: h } = ctx;
  ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
  ctx.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + 'px';
  ctx.style.visibility = '';
}

function showItemMenu(x, y, item, folder) {
  const ctx = $('ctx');
  const canReorder = folder && folder.smartKind === 'none';
  ctx.innerHTML = `
    <button data-a="open">Open</button>
    <button data-a="reveal">Show in Explorer</button>
    ${canReorder ? '<button data-a="left">Move left</button><button data-a="right">Move right</button>' : ''}
    ${canReorder ? '<button class="danger" data-a="remove">Remove</button>' : ''}
  `;
  placeCtx(ctx, x, y);
  ctx.onclick = async (e) => {
    const a = e.target.getAttribute('data-a');
    if (!a) return;
    ctx.hidden = true;
    if (a === 'open') await clutterDock.openItem(item);
    if (a === 'reveal') await clutterDock.revealItem(item);
    if (a === 'left') await call(clutterDock.nudgeItem(item.id, -1, folder.id));
    if (a === 'right') await call(clutterDock.nudgeItem(item.id, 1, folder.id));
    if (a === 'remove') await call(clutterDock.removeItem(item.id, folder.id));
  };
}

function showFolderMenu(x, y, folder) {
  const ctx = $('ctx');
  ctx.innerHTML = `
    <button data-a="grid">Grid view</button>
    <button data-a="list">List view</button>
    ${folder.smartKind === 'none' ? '<button data-a="rename">Rename stack…</button>' : ''}
    ${folder.smartKind === 'none' ? '<button data-a="symbol">Change symbol…</button>' : ''}
    ${folder.smartKind === 'none' ? '<button data-a="image">Custom image…</button>' : ''}
    ${folder.smartKind === 'none' && folder.customImage ? '<button data-a="clearimage">Remove image</button>' : ''}
    ${folder.smartKind === 'none' && !folder.lock ? '<button data-a="lock">Lock with password…</button>' : ''}
    ${folder.smartKind === 'none' && isLockedFolder(folder) ? '<button data-a="unlock">Unlock…</button>' : ''}
    ${folder.smartKind === 'none' && folder.lock && !isLockedFolder(folder) ? '<button data-a="relock">Lock now</button><button data-a="removelock">Remove password</button>' : ''}
    ${folder.smartKind === 'none' ? '<button class="danger" data-a="delete">Delete stack</button>' : ''}
  `;
  placeCtx(ctx, x, y);
  ctx.onclick = async (e) => {
    const a = e.target.getAttribute('data-a');
    if (!a) return;
    ctx.hidden = true;
    if (a === 'grid') await call(clutterDock.setFolderView(folder.id, 'grid'));
    if (a === 'list') await call(clutterDock.setFolderView(folder.id, 'list'));
    if (a === 'rename') {
      const name = await textDialog({
        title: 'Rename stack',
        value: folder.name,
        placeholder: 'e.g. Coding, Work',
        submitLabel: 'Rename',
      });
      if (name) await call(clutterDock.renameFolder(folder.id, name));
    }
    if (a === 'symbol') {
      const symbol = await symbolDialog(folder.name, folder.symbol);
      if (symbol) await call(clutterDock.setFolderSymbol(folder.id, symbol));
    }
    if (a === 'image') await call(clutterDock.pickFolderImage(folder.id));
    if (a === 'clearimage') await call(clutterDock.clearFolderImage(folder.id));
    if (a === 'lock') await lockStack(folder);
    if (a === 'unlock') await unlockStack(folder);
    if (a === 'relock') await call(clutterDock.relockFolder(folder.id));
    if (a === 'removelock') await call(clutterDock.removeFolderLock(folder.id));
    if (a === 'delete') await call(clutterDock.deleteFolder(folder.id));
  };
}

async function addUrlPrompt() {
  const url = await textDialog({
    title: 'Add URL',
    placeholder: 'https://example.com',
    submitLabel: 'Add',
  });
  if (url) await call(clutterDock.addURL(url));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Default drop behaviour navigates the window to the dropped URL — never allow it.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// Drag files / URLs into panel
const contentEl = $('content');
contentEl.addEventListener('dragover', (e) => {
  const types = [...e.dataTransfer.types];
  if (types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain')) {
    e.preventDefault();
    contentEl.classList.add('drop-active');
  }
});
contentEl.addEventListener('dragleave', () => contentEl.classList.remove('drop-active'));
contentEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  contentEl.classList.remove('drop-active');
  const files = [...(e.dataTransfer.files || [])]
    .map((f) => clutterDock.pathForFile(f))
    .filter(Boolean);
  if (files.length) {
    await call(clutterDock.addPaths(files));
    return;
  }
  // Browser link or pasted URL text (require a scheme or a plausible bare domain —
  // "any text with a dot" used to become a URL)
  const uri =
    e.dataTransfer.getData('text/uri-list') ||
    e.dataTransfer.getData('text/plain') ||
    '';
  const first = uri.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'));
  if (first && (first.includes('://') || /^[\w-]+(\.[\w-]+)*\.[A-Za-z]{2,}(\/\S*)?$/.test(first))) {
    await call(clutterDock.addURL(first));
  }
});

$('search').addEventListener('input', async (e) => {
  searchText = e.target.value;
  await refresh();
});
async function toggleGlobalSearch() {
  if (!snapshot?.gate?.canUseGlobalSearch) {
    upsellDialog('Search across all folders is a Pro feature.');
    return;
  }
  searchGlobal = !searchGlobal;
  await refresh();
}
$('searchAll').onclick = toggleGlobalSearch;
$('settingsBtn').onclick = () => clutterDock.openSettings();

const HELP_KEYS = [
  ['Ctrl+Shift+D', 'Open / close'],
  ['Esc', 'Close'],
  ['Enter', 'Open selected'],
  ['Arrows', 'Move selection'],
  ['Ctrl+G', 'Toggle search all'],
  ['Alt+← / Alt+→', 'Reorder item'],
];

function helpDialog() {
  return openModal((modal) => {
    const rows = HELP_KEYS.map(
      ([keys, what]) => `<tr><td class="help-keys">${escapeHtml(keys)}</td><td>${escapeHtml(what)}</td></tr>`
    ).join('');
    modal.innerHTML = `
      <div class="card dialog">
        <h2>Keyboard shortcuts</h2>
        <table class="help-table">${rows}</table>
        <div class="row">
          <button class="btn primary" id="dlgOk">Done</button>
        </div>
      </div>`;
    $('dlgOk').onclick = () => closeModal(null);
    $('dlgOk').focus();
  });
}
$('helpBtn').onclick = helpDialog;

document.addEventListener('click', (e) => {
  if (!$('ctx').contains(e.target)) $('ctx').hidden = true;
});

document.addEventListener('keydown', async (e) => {
  if (modalOpen()) {
    if (e.key === 'Escape') closeModal(null);
    return;
  }
  if (e.key === 'Escape') {
    if (!snapshot?.prefs?.hasCompletedOnboarding) {
      await call(clutterDock.updatePrefs({ hasCompletedOnboarding: true }));
      return;
    }
    await clutterDock.hidePanel();
    return;
  }
  if (e.key === 'g' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    await toggleGlobalSearch();
    return;
  }
  const items = itemsForView();
  if (!items.length) return;
  const idx = Math.max(0, items.findIndex((i) => i.id === selectedId));
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (e.altKey && selectedFolder()?.smartKind === 'none' && selectedId) {
      await call(clutterDock.nudgeItem(selectedId, 1, selectedFolder().id));
    } else {
      selectedId = items[Math.min(items.length - 1, idx + 1)].id;
      renderContent();
    }
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (e.altKey && selectedFolder()?.smartKind === 'none' && selectedId) {
      await call(clutterDock.nudgeItem(selectedId, -1, selectedFolder().id));
    } else {
      selectedId = items[Math.max(0, idx - 1)].id;
      renderContent();
    }
  }
  if (e.key === 'Enter' && selectedId) {
    const item = items.find((i) => i.id === selectedId);
    if (item) await clutterDock.openItem(item);
  }
});

clutterDock.onSnapshot((data) => {
  snapshot = data;
  render();
});

refresh();
