/* global clutterDock */

let snapshot = null;
let searchGlobal = false;
let searchText = '';
let selectedId = null; // selection anchor (keyboard + shift ranges)
let selectedIds = new Set(); // full multi-selection
let dragId = null;

const $ = (id) => document.getElementById(id);

function setSelection(ids, anchor) {
  selectedIds = new Set(ids);
  selectedId = anchor ?? [...selectedIds][0] ?? null;
}

function isSelected(id) {
  return selectedIds.has(id) || id === selectedId;
}

// --- Launcher-grade matching (mirrors the main-process searchAll scoring) ---

function subsequenceMatch(hay, q) {
  let i = 0;
  for (const ch of hay) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

function frecencyMap() {
  const map = new Map();
  for (const e of snapshot?.history || []) map.set(`${e.kind}|${e.path}`, e);
  return map;
}

function itemScore(item, q, hist) {
  const name = String(item.name || '').toLowerCase();
  const p = String(item.path || '').toLowerCase();
  let score = 0;
  if (name === q) score = 200;
  else if (name.startsWith(q)) score = 140;
  else if (name.includes(q)) score = 100;
  else if (p.includes(q)) score = 40;
  else if (q.length >= 2 && subsequenceMatch(name, q)) score = 25;
  if (!score) return 0;
  const h = hist.get(`${item.kind}|${item.path}`);
  if (h) {
    score += Math.min(h.openCount || 0, 20) * 2;
    const age = Date.now() - Date.parse(h.lastOpened || 0);
    if (age >= 0 && age < 7 * 24 * 3600 * 1000) score += 10;
  }
  return score;
}

/** Windows-style display path — items are stored with either separator. */
function displayPath(p) {
  return /^[A-Za-z]:[\\/]/.test(p) ? String(p).replace(/\//g, '\\') : String(p);
}

/** Wrap the matched query characters of `name` in <b>, HTML-escaped. */
function highlightName(name, q) {
  const raw = String(name);
  if (!q) return escapeHtml(raw);
  const lower = raw.toLowerCase();
  let ranges = [];
  const idx = lower.indexOf(q);
  if (idx >= 0) {
    ranges = [[idx, idx + q.length]];
  } else if (q.length >= 2) {
    // subsequence: mark each matched character
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i++) {
      if (lower[i] === q[qi]) {
        ranges.push([i, i + 1]);
        qi += 1;
      }
    }
    if (qi < q.length) ranges = [];
  }
  if (!ranges.length) return escapeHtml(raw);
  let out = '';
  let pos = 0;
  for (const [a, b] of ranges) {
    out += escapeHtml(raw.slice(pos, a)) + '<b>' + escapeHtml(raw.slice(a, b)) + '</b>';
    pos = b;
  }
  return out + escapeHtml(raw.slice(pos));
}

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
  } else if (folder.smartKind === 'mostused') {
    items = [...(snapshot.history || [])]
      .sort((a, b) => (b.openCount || 0) - (a.openCount || 0))
      .map((e) => ({ id: e.id, kind: e.kind, path: e.path, name: e.name }));
  } else {
    items = [...(folder.items || [])];
    if (folder.sortMode === 'nameAZ') items.sort((a, b) => a.name.localeCompare(b.name));
    if (folder.sortMode === 'nameZA') items.sort((a, b) => b.name.localeCompare(a.name));
    if (folder.sortMode === 'kind') {
      items.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    }
  }
  if (q && !searchGlobal) {
    const hist = frecencyMap();
    items = items
      .map((i) => ({ item: i, score: itemScore(i, q, hist) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);
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
  else if (res && res.ok === false && res.error) infoDialog(res.error);
  return res;
}

// ---- Native file icons (data URLs from the main process; emoji fallback) ----

const iconMemo = new Map();

function hydrateIcon(container, item) {
  if (!container) return; // URLs hydrate too: favicons come back as data URLs
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
    infoDialog(snapshot.dataWarning, 'Heads up');
  }
  document.body.classList.toggle('acrylic', !!snapshot.runtime?.acrylic);
  renderWorkspaceBar();
  renderTabs();
  renderContent();
  renderHints();
  renderOnboarding();
  const items = itemsForView();
  const sel = selectedIds.size > 1 ? ` · ${selectedIds.size} selected` : '';
  $('count').textContent = `${items.length} item${items.length === 1 ? '' : 's'}${sel}`;
  $('searchAll').classList.toggle('on', searchGlobal);
  $('pinBtn').classList.toggle('on', !!snapshot.prefs.keepOpen);
  $('pinBtn').title = snapshot.prefs.keepOpen
    ? 'Unpin — hide when it loses focus'
    : 'Pin the launcher open';
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
    // Rebuilding the DOM mid-drag kills the drag in progress
    if (!dragId) renderContent();
  });
}

function isRunning(item) {
  return item.kind === 'app' && runningPathSet.has(String(item.path || '').toLowerCase());
}

function renderTabs() {
  const tabs = $('tabs');
  const folders = visibleFolders();
  tabs.innerHTML = '';
  // Tabs scroll in their own strip; the actions + tier badge stay pinned in
  // view (inside one scroller they'd be pushed off-screen by enough stacks).
  const scroller = document.createElement('div');
  scroller.className = 'tab-scroll';
  // Vertical wheel scrolls the horizontal strip
  scroller.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      scroller.scrollLeft += e.deltaY;
    }
  }, { passive: false });
  for (const f of folders) {
    const b = document.createElement('button');
    b.className = 'tab' + (f.id === snapshot.state.selectedFolderID ? ' active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', f.id === snapshot.state.selectedFolderID ? 'true' : 'false');
    b.textContent = stackLabel(f);
    if (f.color && /^#[0-9a-fA-F]{6}$/.test(f.color)) {
      // Accent tint: stronger when active
      b.style.backgroundColor = f.color + (f.id === snapshot.state.selectedFolderID ? '55' : '2b');
      if (f.id === snapshot.state.selectedFolderID) b.style.color = 'var(--text)';
    }
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
        // Dragging one of a multi-selection moves the whole selection
        const ids = selectedIds.has(itemId) && selectedIds.size > 1 ? [...selectedIds] : [itemId];
        for (const id of ids) await call(clutterDock.relocateItem(id, f.id));
        dragId = null;
        setSelection([]);
        return;
      }
      if (files.length) {
        await call(clutterDock.addPaths(files, f.id));
      }
    });
    scroller.appendChild(b);
  }
  tabs.appendChild(scroller);
  scroller.querySelector('.tab.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  const actions = document.createElement('div');
  actions.className = 'tab-actions';
  const manyStacks = folders.length > 6;
  actions.innerHTML = `
    ${manyStacks ? `<button class="icon-btn" id="switcherBtn" title="All stacks (Ctrl+Tab cycles)" aria-label="All stacks">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    </button>` : ''}
    <button class="icon-btn" id="addFolderBtn" title="New stack" aria-label="New stack">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
    </button>
    <button class="icon-btn" id="addItemsBtn" title="Add items" aria-label="Add items">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  `;
  tabs.appendChild(actions);
  if (manyStacks) $('switcherBtn').onclick = stackSwitcherDialog;
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

let lastContentKey = null;

function renderContent() {
  const content = $('content');
  const folder = selectedFolder();
  const items = itemsForView();
  content.classList.remove('drop-active');
  // Animate the content swap only when the view genuinely changes
  const contentKey = `${folder?.id}|${folder?.viewMode}|${searchGlobal && searchText.trim() ? 'g' : ''}`;
  content.classList.toggle('content-anim', contentKey !== lastContentKey);
  lastContentKey = contentKey;

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
        <div style="font-size:36px">${isSmart ? (folder.smartKind === 'mostused' ? '⭐' : '🕒') : '📦'}</div>
        <h3>${emptyTitle(folder)}</h3>
        <p>${emptySub(folder)}</p>
        ${
          !isSmart
            ? `<div class="actions">
                <button class="btn primary" id="emptyAdd">Add apps…</button>
                <button class="btn secondary" id="emptyUrl">Add URL…</button>
                <button class="btn secondary" id="emptyImport">Import pinned apps…</button>
              </div>`
            : ''
        }
      </div>`;
    $('emptyAdd')?.addEventListener('click', async () => {
      await call(clutterDock.pickAndAdd());
    });
    $('emptyUrl')?.addEventListener('click', addUrlPrompt);
    $('emptyImport')?.addEventListener('click', importWizardDialog);
    return;
  }

  const viewMode = folder?.viewMode || 'grid';
  const q = searchText.trim().toLowerCase();
  if (viewMode === 'list' || (searchGlobal && searchText.trim())) {
    content.innerHTML = `<div class="list" id="list"></div>`;
    const list = $('list');
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'list-row' + (isSelected(item.id) ? ' selected' : '');
      row.title = `${item.name}\n${displayPath(item.path)}`;
      row.innerHTML = `
        <div class="tile-icon ${item.kind}">${ICON[item.kind] || '📄'}</div>
        <div class="meta">
          <div class="name">${highlightName(item.name, q)}${isRunning(item) ? ' <span class="run-dot" aria-hidden="true"></span>' : ''}</div>
          <div class="sub">${escapeHtml(item._folderName || item.kind + ' · ' + displayPath(item.path))}</div>
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
      tile.className = 'tile' + (isSelected(item.id) ? ' selected' : '');
      tile.title = `${item.name}\n${displayPath(item.path)}`; // truncated names stay readable
      tile.draggable = folder?.smartKind === 'none';
      tile.innerHTML = `
        <div class="tile-icon ${item.kind}">${ICON[item.kind] || '📄'}</div>
        ${isRunning(item) ? '<span class="run-dot" aria-hidden="true"></span>' : ''}
        <div class="tile-name">${highlightName(item.name, q)}</div>`;
      wireItem(tile, item, folder);
      hydrateIcon(tile.querySelector('.tile-icon'), item);
      if (folder?.smartKind === 'none') {
        tile.addEventListener('dragstart', (e) => {
          // Alt+drag hands the real file to the OS (drop into Explorer, email…)
          if (e.altKey && item.kind !== 'url') {
            e.preventDefault();
            clutterDock.startItemDrag(item.id);
            return;
          }
          dragId = item.id;
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.effectAllowed = 'move';
        });
        tile.addEventListener('dragend', () => {
          // Also fires after a cancelled drag — without this the running-paths
          // render guard would stay stuck on
          dragId = null;
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
  el.onclick = async (e) => {
    // Ctrl/Shift build a multi-selection instead of launching
    if (e && e.ctrlKey) {
      const ids = new Set(selectedIds);
      if (selectedId && !ids.size) ids.add(selectedId);
      if (ids.has(item.id)) ids.delete(item.id);
      else ids.add(item.id);
      setSelection([...ids], item.id);
      renderContent();
      render();
      return;
    }
    if (e && e.shiftKey && selectedId) {
      const items = itemsForView();
      const a = items.findIndex((i) => i.id === selectedId);
      const b = items.findIndex((i) => i.id === item.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelection(items.slice(lo, hi + 1).map((i) => i.id), selectedId);
        renderContent();
        render();
        return;
      }
    }
    setSelection([item.id], item.id);
    renderContent();
    // Immediate visual acknowledgement — the launch itself takes a beat
    const launched = document.querySelector('.tile.selected, .list-row.selected');
    if (launched) {
      launched.classList.add('launching');
      setTimeout(() => launched.classList.remove('launching'), 450);
    }
    const res = await clutterDock.openItem(item);
    if (!res?.ok && res?.error) infoDialog(res.error);
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
  if (folder?.smartKind === 'mostused') return 'No launches counted yet';
  return 'This folder is empty';
}
function emptySub(folder) {
  if (folder?.smartKind === 'recents') {
    return 'Open items from your folders — they will show up here.';
  }
  if (folder?.smartKind === 'mostused') {
    return 'Your most-opened items rise to the top here automatically.';
  }
  return 'Drop apps, files, or folders here — paste with Ctrl+V — or use ＋ to add them.';
}

function renderHints() {
  const hints = $('hints');
  if (!snapshot.prefs.showKeyboardHints) {
    hints.textContent = '';
    return;
  }
  // One quiet line; the ? button carries the full list
  hints.textContent = 'Type to search · Enter opens · Ctrl+Tab switches stacks · ? for all shortcuts';
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
  const showRegister = !snapshot.prefs.installRegisterChoice;
  overlay.innerHTML = `
    <div class="card">
      <h2>✨ Welcome to ClutterDock</h2>
      <p class="ob-tagline">Your taskbar, decluttered — stacks of apps, files, and links, one hotkey away.</p>
      <div class="ob-steps">
        <div class="ob-step"><span class="ob-step-icon">🗂️</span><div><b>Make stacks</b><span>Coding, Work, Clients — or import what's already pinned</span></div></div>
        <div class="ob-step"><span class="ob-step-icon">📥</span><div><b>Fill them</b><span>Drop, paste (Ctrl+V), or Send&nbsp;to&nbsp;→&nbsp;ClutterDock from Explorer</span></div></div>
        <div class="ob-step"><span class="ob-step-icon">⚡</span><div><b>Summon</b><span>Pin to the taskbar, click it — or press <b>Ctrl+Shift+D</b> and just type</span></div></div>
      </div>
      ${
        showRegister
          ? `<div class="ob-register">
        <b>Optional: count this install</b>
        <p>One anonymous ping (Windows + version + random ID). Email only for release news. Skipping sends nothing.</p>
        <div class="row">
          <input id="obEmail" type="email" placeholder="Email (optional)" aria-label="Email for release news (optional)" />
          <button class="btn secondary" id="obCount">Count me in</button>
        </div>
        <p class="ob-register-status" id="obRegStatus" aria-live="polite"></p>
      </div>`
          : ''
      }
      <div class="row ob-actions">
        <button class="btn primary" id="obImport">Import my pinned apps…</button>
        <button class="btn secondary" id="obAdd">Add apps…</button>
      </div>
      <div class="ob-links">
        <button class="link-btn" id="obSettings">Settings</button>
        <span aria-hidden="true">·</span>
        <button class="link-btn" id="obGot">Skip for now</button>
      </div>
    </div>`;
  // Any way out of the card counts as skip if the user didn't opt in —
  // the register offer must never be shown again (RON-507).
  const dismissPrefs = () => ({
    hasCompletedOnboarding: true,
    ...(snapshot.prefs.installRegisterChoice ? {} : { installRegisterChoice: 'skipped' }),
  });
  $('obGot').onclick = async () => {
    await call(clutterDock.updatePrefs(dismissPrefs()));
  };
  $('obAdd').onclick = async () => {
    await clutterDock.updatePrefs(dismissPrefs());
    await call(clutterDock.pickAndAdd());
  };
  $('obImport').onclick = async () => {
    await call(clutterDock.updatePrefs(dismissPrefs()));
    await importWizardDialog();
  };
  $('obSettings').onclick = async () => {
    await clutterDock.updatePrefs(dismissPrefs());
    await clutterDock.openSettings();
  };
  if (showRegister) {
    $('obCount').onclick = async () => {
      const btn = $('obCount');
      btn.disabled = true;
      $('obRegStatus').textContent = 'Sending…';
      const res = await clutterDock.registerInstall($('obEmail').value);
      if (res?.ok) {
        snapshot = res.snapshot || snapshot;
        $('obRegStatus').textContent = 'Thanks — this install is counted!';
        $('obEmail').disabled = true;
      } else {
        btn.disabled = false;
        $('obRegStatus').textContent = res?.error || 'Could not send — try later in Settings.';
      }
    };
  }
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

/* window.alert() in a frameless Electron window leaves inputs unfocusable on
   Windows until the window is refocused — errors go through the in-panel modal. */
function infoDialog(message, title = 'ClutterDock') {
  return openModal((modal) => {
    modal.innerHTML = `
      <div class="card dialog">
        <h2>${escapeHtml(title)}</h2>
        <p class="dialog-sub">${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
        <div class="row">
          <button class="btn primary" id="dlgOk">OK</button>
        </div>
      </div>`;
    $('dlgOk').onclick = () => closeModal(null);
    $('dlgOk').focus();
  });
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

/** Grid popover of every stack, filterable — livable "unlimited stacks" (Ctrl+Tab cycles). */
function stackSwitcherDialog() {
  return openModal((modal) => {
    modal.innerHTML = `
      <div class="card dialog">
        <h2>All stacks</h2>
        <input type="text" id="swFilter" placeholder="Filter stacks…" autocomplete="off" spellcheck="false" />
        <div class="switcher-grid" id="swGrid"></div>
      </div>`;
    const grid = $('swGrid');
    const filter = $('swFilter');
    const renderList = () => {
      const q = filter.value.trim().toLowerCase();
      const folders = visibleFolders().filter((f) => !q || f.name.toLowerCase().includes(q));
      grid.innerHTML = '';
      for (const f of folders) {
        const b = document.createElement('button');
        b.className = 'switcher-cell' + (f.id === snapshot.state.selectedFolderID ? ' active' : '');
        if (f.color) b.style.borderColor = f.color;
        const count = f.smartKind === 'none' ? (f.items || []).length : (snapshot.history || []).length;
        b.innerHTML = `<span class="sw-symbol">${isLockedFolder(f) ? '🔒' : STACK_EMOJI[f.symbol] || STACK_EMOJI.folder}</span>
          <span class="sw-name">${escapeHtml(f.name)}</span>
          <span class="sw-count">${count}</span>`;
        b.onclick = async () => {
          closeModal(null);
          await call(clutterDock.selectFolder(f.id));
        };
        grid.appendChild(b);
      }
    };
    filter.oninput = renderList;
    filter.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const first = grid.querySelector('.switcher-cell');
        if (first) first.click();
      }
    };
    renderList();
    filter.focus();
  });
}

function cycleStack(direction) {
  const folders = visibleFolders();
  if (folders.length < 2) return;
  const idx = folders.findIndex((f) => f.id === snapshot.state.selectedFolderID);
  const next = folders[(idx + direction + folders.length) % folders.length];
  call(clutterDock.selectFolder(next.id));
}

/** Import wizard: pull in what's already pinned to the taskbar / desktop / Start Menu. */
async function importWizardDialog() {
  const entries = await clutterDock.scanImportSources();
  if (!entries || !entries.length) {
    infoDialog('No importable shortcuts found on the taskbar, desktop, or Start Menu.');
    return;
  }
  const chosen = await openModal((modal) => {
    const groups = ['Taskbar', 'Desktop', 'Start Menu'].filter((g) =>
      entries.some((x) => x.source === g)
    );
    modal.innerHTML = `
      <div class="card dialog">
        <h2>Import your apps</h2>
        <p class="dialog-sub">These shortcuts already exist on this PC. Tick what belongs in your stacks — nothing is moved or changed.</p>
        <div class="import-list" id="impList">
          ${groups
            .map(
              (g) => `
            <div class="import-group">
              <label class="import-group-head"><input type="checkbox" data-group="${g}" ${g === 'Taskbar' ? 'checked' : ''}/> <b>${g}</b></label>
              ${entries
                .filter((x) => x.source === g)
                .map(
                  (x, i) =>
                    `<label class="import-row"><input type="checkbox" data-target="${escapeHtml(x.target)}" data-name="${escapeHtml(x.name)}" ${
                      g === 'Taskbar' ? 'checked' : ''
                    }/> ${escapeHtml(x.name)}</label>`
                )
                .join('')}
            </div>`
            )
            .join('')}
        </div>
        <div class="row">
          <button class="btn primary" id="dlgOk">Import selected</button>
          <button class="btn secondary" id="dlgCancel">Cancel</button>
        </div>
      </div>`;
    for (const head of modal.querySelectorAll('[data-group]')) {
      head.onchange = () => {
        const group = head.closest('.import-group');
        for (const cb of group.querySelectorAll('[data-target]')) cb.checked = head.checked;
      };
    }
    $('dlgOk').onclick = () => {
      const picks = [...modal.querySelectorAll('[data-target]')]
        .filter((cb) => cb.checked)
        .map((cb) => ({ target: cb.dataset.target, name: cb.dataset.name }));
      closeModal(picks);
    };
    $('dlgCancel').onclick = () => closeModal(null);
  });
  if (!chosen || !chosen.length) return;
  const folder = selectedFolder();
  const targetID =
    folder && folder.smartKind === 'none'
      ? folder.id
      : visibleFolders().find((f) => f.smartKind === 'none')?.id;
  await call(clutterDock.importShortcuts(chosen, targetID));
}

if (clutterDock.onOpenImport) clutterDock.onOpenImport(() => importWizardDialog());

// Keep the fixed-position context menu inside the panel bounds
function placeCtx(ctx, x, y) {
  ctx.style.visibility = 'hidden';
  ctx.hidden = false;
  const { offsetWidth: w, offsetHeight: h } = ctx;
  ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
  ctx.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + 'px';
  ctx.style.visibility = '';
}

function otherStacks(excludeID) {
  return visibleFolders().filter((f) => f.smartKind === 'none' && f.id !== excludeID);
}

function showItemMenu(x, y, item, folder) {
  const ctx = $('ctx');
  const canReorder = folder && folder.smartKind === 'none';
  const isSmart = folder && folder.smartKind !== 'none';
  const multi = selectedIds.size > 1 && selectedIds.has(item.id);
  const n = multi ? selectedIds.size : 1;
  const isExe = item.kind === 'app' && /\.(exe|lnk|bat|cmd|msi)$/i.test(item.path || '');
  const targets = otherStacks(folder?.id);
  ctx.innerHTML = `
    <button data-a="open">${multi ? `Open ${n} items` : 'Open'}<span class="ctx-key">Enter</span></button>
    ${isExe && !multi ? '<button data-a="admin">Run as administrator</button>' : ''}
    ${item.kind !== 'url' && !multi ? '<button data-a="reveal">Show in Explorer</button>' : ''}
    <div class="ctx-sep"></div>
    <button data-a="copy">${multi ? `Copy ${n} items` : item.kind === 'url' ? 'Copy URL' : 'Copy'}<span class="ctx-key">Ctrl+C</span></button>
    ${!multi && item.kind !== 'url' ? '<button data-a="copypath">Copy path</button>' : ''}
    ${canReorder && !multi ? '<button data-a="renameitem">Rename…</button>' : ''}
    ${(canReorder || isSmart) && targets.length ? `<button data-a="moveto">${isSmart ? 'Add to stack' : multi ? `Move ${n} to stack` : 'Move to stack'} ▸</button>` : ''}
    ${canReorder && !multi ? '<div class="ctx-sep"></div><button data-a="left">Move left<span class="ctx-key">Alt+←</span></button><button data-a="right">Move right<span class="ctx-key">Alt+→</span></button>' : ''}
    ${canReorder ? `<div class="ctx-sep"></div><button class="danger" data-a="remove">${multi ? `Remove ${n} items` : 'Remove'}<span class="ctx-key">Del</span></button>` : ''}
  `;
  placeCtx(ctx, x, y);
  ctx.onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.getAttribute('data-a');
    if (!a) return;
    if (a === 'moveto') {
      // Second level: pick the destination stack in place
      ctx.innerHTML = targets
        .map((f) => `<button data-stack="${f.id}">${escapeHtml(stackLabel(f))}</button>`)
        .join('');
      ctx.onclick = async (ev) => {
        const dest = ev.target.closest('[data-stack]')?.getAttribute('data-stack');
        if (!dest) return;
        ctx.hidden = true;
        if (isSmart) {
          // History items are virtual — add the underlying path/URL to the stack
          const picks = multi
            ? itemsForView().filter((i) => selectedIds.has(i.id))
            : [item];
          for (const p of picks) {
            if (p.kind === 'url') await call(clutterDock.addURL(p.path, dest));
            else await call(clutterDock.addPaths([p.path], dest));
          }
        } else {
          const ids = multi ? [...selectedIds] : [item.id];
          for (const id of ids) await call(clutterDock.relocateItem(id, dest));
        }
        setSelection([]);
      };
      return;
    }
    ctx.hidden = true;
    const pickItems = () => (multi ? itemsForView().filter((i) => selectedIds.has(i.id)) : [item]);
    if (a === 'open') {
      for (const p of pickItems()) await clutterDock.openItem(p);
      await refresh();
    }
    if (a === 'admin') {
      const res = await clutterDock.openItemAdmin(item.id);
      if (!res?.ok && res?.error) infoDialog(res.error);
    }
    if (a === 'reveal') await clutterDock.revealItem(item);
    if (a === 'copy') {
      const res = await clutterDock.copyItems(pickItems().map((i) => i.id));
      if (!res?.ok && res?.error) infoDialog(res.error);
    }
    if (a === 'copypath') {
      try {
        await navigator.clipboard.writeText(displayPath(item.path));
      } catch (_) {
        await clutterDock.copyItems([item.id]);
      }
    }
    if (a === 'renameitem') {
      const name = await textDialog({
        title: 'Rename item',
        value: item.name,
        submitLabel: 'Rename',
      });
      if (name) await call(clutterDock.renameItem(item.id, folder.id, name));
    }
    if (a === 'left') await call(clutterDock.nudgeItem(item.id, -1, folder.id));
    if (a === 'right') await call(clutterDock.nudgeItem(item.id, 1, folder.id));
    if (a === 'remove') {
      const ids = multi ? [...selectedIds] : [item.id];
      for (const id of ids) await call(clutterDock.removeItem(id, folder.id));
      setSelection([]);
    }
  };
}

const STACK_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', ''];

function showFolderMenu(x, y, folder) {
  const ctx = $('ctx');
  const colorRow =
    folder.smartKind === 'none'
      ? `<div class="ctx-colors" role="group" aria-label="Stack color">${STACK_COLORS.map(
          (c) =>
            `<button class="ctx-color${c ? '' : ' none'}${(folder.color || '') === c ? ' current' : ''}" data-color="${c}" ${
              c ? `style="background:${c}"` : 'title="No color"'
            } aria-label="${c || 'No color'}"></button>`
        ).join('')}</div>`
      : '';
  const isNormal = folder.smartKind === 'none';
  ctx.innerHTML = `
    ${colorRow}
    <button data-a="grid">Grid view</button>
    <button data-a="list">List view</button>
    ${isNormal ? `
    <div class="ctx-sep"></div>
    <button data-a="rename">Rename stack…</button>
    <button data-a="symbol">Change symbol…</button>
    <button data-a="image">Custom image…</button>
    ${folder.customImage ? '<button data-a="clearimage">Remove image</button>' : ''}
    <div class="ctx-sep"></div>
    ${!folder.lock ? '<button data-a="lock">Lock with password…</button>' : ''}
    ${isLockedFolder(folder) ? '<button data-a="unlock">Unlock…</button>' : ''}
    ${folder.lock && !isLockedFolder(folder) ? '<button data-a="relock">Lock now</button><button data-a="removelock">Remove password</button>' : ''}
    <div class="ctx-sep"></div>
    <button class="danger" data-a="delete">Delete stack</button>` : ''}
  `;
  placeCtx(ctx, x, y);
  ctx.onclick = async (e) => {
    const colorBtn = e.target.closest('[data-color]');
    if (colorBtn) {
      ctx.hidden = true;
      await call(clutterDock.setFolderColor(folder.id, colorBtn.getAttribute('data-color')));
      return;
    }
    const a = e.target.closest('[data-a]')?.getAttribute('data-a');
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

// Launcher flow: hotkey → type → Enter opens the top match
$('search').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const items = itemsForView();
    if (items.length && searchText.trim()) {
      const res = await clutterDock.openItem(items[0]);
      if (!res?.ok && res?.error) infoDialog(res.error);
      else await refresh();
    }
    return;
  }
  if (e.key === 'Escape') {
    if (searchText.trim()) {
      // First Esc clears the search; the global handler hides on the next one
      e.preventDefault();
      e.stopPropagation();
      $('search').value = '';
      searchText = '';
      await refresh();
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const items = itemsForView();
    if (items.length) {
      setSelection([items[0].id], items[0].id);
      renderContent();
      $('search').blur();
    }
  }
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
  ['Esc', 'Close (clears search first)'],
  ['Type anywhere', 'Search; Enter opens the top match'],
  ['Arrows', 'Move selection (↑↓ move by row)'],
  ['Ctrl+F', 'Focus search'],
  ['Ctrl+G', 'Toggle search all'],
  ['Ctrl+Tab', 'Next stack (Shift for previous)'],
  ['Ctrl+Click / Shift+Click', 'Select several items'],
  ['Ctrl+C / Ctrl+V', 'Copy items / paste files & URLs'],
  ['Delete', 'Remove selected'],
  ['Alt+drag', 'Drag a real file out to another app'],
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

/** Columns in the visible grid, so ↑/↓ move by a full row. */
function gridColumns() {
  const grid = $('grid');
  if (!grid) return 1; // list view: one column
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
  return Math.max(1, cols);
}

document.addEventListener('keydown', async (e) => {
  if (modalOpen()) {
    if (e.key === 'Escape') closeModal(null);
    return;
  }
  const inInput = /^(input|textarea)$/i.test(document.activeElement?.tagName || '');
  if (e.key === 'Escape') {
    if (!snapshot?.prefs?.hasCompletedOnboarding) {
      // Esc dismisses the welcome card — that skip also declines the
      // register offer for good (RON-507).
      await call(clutterDock.updatePrefs({
        hasCompletedOnboarding: true,
        ...(snapshot.prefs.installRegisterChoice ? {} : { installRegisterChoice: 'skipped' }),
      }));
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
  if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    $('search').focus();
    $('search').select();
    return;
  }
  if (e.key === 'Tab' && e.ctrlKey) {
    e.preventDefault();
    cycleStack(e.shiftKey ? -1 : 1);
    return;
  }
  if (inInput) return;
  if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const folder = selectedFolder();
    if (folder?.smartKind === 'none') {
      const res = await call(clutterDock.pasteAdd(folder.id));
      if (res?.pasted === 0 && !res?.limitMessage) {
        infoDialog('Nothing on the clipboard that ClutterDock can add.');
      }
    }
    return;
  }
  if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
    const ids = selectedIds.size ? [...selectedIds] : selectedId ? [selectedId] : [];
    if (ids.length) {
      e.preventDefault();
      await clutterDock.copyItems(ids);
    }
    return;
  }
  if (e.key === 'Delete') {
    const folder = selectedFolder();
    if (folder?.smartKind === 'none') {
      const ids = selectedIds.size ? [...selectedIds] : selectedId ? [selectedId] : [];
      for (const id of ids) await call(clutterDock.removeItem(id, folder.id));
      setSelection([]);
    }
    return;
  }
  // Type-to-search: printable characters land in the search box
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const search = $('search');
    search.focus();
    search.value += e.key;
    e.preventDefault();
    searchText = search.value;
    await refresh();
    return;
  }
  const items = itemsForView();
  if (!items.length) return;
  const idx = Math.max(0, items.findIndex((i) => i.id === selectedId));
  const step = (delta) => {
    const next = Math.min(items.length - 1, Math.max(0, idx + delta));
    setSelection([items[next].id], items[next].id);
    renderContent();
  };
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (e.altKey && selectedFolder()?.smartKind === 'none' && selectedId) {
      await call(clutterDock.nudgeItem(selectedId, 1, selectedFolder().id));
    } else step(1);
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (e.altKey && selectedFolder()?.smartKind === 'none' && selectedId) {
      await call(clutterDock.nudgeItem(selectedId, -1, selectedFolder().id));
    } else step(-1);
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    step(gridColumns()); // a full row down, not one item over
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (idx - gridColumns() < 0) {
      $('search').focus();
    } else step(-gridColumns());
  }
  if (e.key === 'Enter' && selectedId) {
    const item = items.find((i) => i.id === selectedId);
    if (item) await clutterDock.openItem(item);
  }
});

// A drag anywhere over the panel suspends the blur auto-hide until it ends
let dragDepth = 0;
document.addEventListener('dragenter', () => {
  dragDepth += 1;
  if (dragDepth === 1) clutterDock.setDragActive?.(true);
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) clutterDock.setDragActive?.(false);
});
document.addEventListener('drop', () => {
  dragDepth = 0;
  clutterDock.setDragActive?.(false);
});

$('pinBtn').onclick = () =>
  call(clutterDock.updatePrefs({ keepOpen: !snapshot?.prefs?.keepOpen }));

clutterDock.onSnapshot((data) => {
  snapshot = data;
  render();
});

// Every appearance: entrance motion, clean slate, caret ready in search
if (clutterDock.onPanelShown) {
  clutterDock.onPanelShown(() => {
    const appEl = document.getElementById('app');
    appEl.classList.remove('panel-enter');
    void appEl.offsetWidth; // restart the animation
    appEl.classList.add('panel-enter');
    const search = $('search');
    if (search.value) {
      search.value = '';
      searchText = '';
      refresh();
    }
    if (snapshot?.prefs?.hasCompletedOnboarding) {
      search.focus();
    }
  });
}

refresh();
