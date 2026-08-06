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

function selectedFolder() {
  if (!snapshot) return null;
  const { folders, selectedFolderID } = snapshot.state;
  return folders.find((f) => f.id === selectedFolderID) || folders[0];
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

function render() {
  if (!snapshot) return;
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
  const emoji = STACK_EMOJI[f.symbol] || STACK_EMOJI.folder;
  return `${emoji} ${f.name}`;
}

function renderTabs() {
  const tabs = $('tabs');
  const folders = snapshot.state.folders || [];
  tabs.innerHTML = '';
  for (const f of folders) {
    const b = document.createElement('button');
    b.className = 'tab' + (f.id === snapshot.state.selectedFolderID ? ' active' : '');
    b.textContent = stackLabel(f);
    b.title =
      f.smartKind && f.smartKind !== 'none'
        ? `${f.name} (smart — drop on normal stacks only)`
        : `Drop apps/files here · click to open`;
    b.onclick = async () => {
      await refresh(await clutterDock.selectFolder(f.id));
    };
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
      const files = [...(e.dataTransfer.files || [])].map((x) => x.path).filter(Boolean);
      if (itemId && !files.length) {
        await refresh(await clutterDock.relocateItem(itemId, f.id));
        dragId = null;
        return;
      }
      if (files.length) {
        const snap = await clutterDock.addPaths(files, f.id);
        if (snap?._limitMessage) alert(snap._limitMessage + '\n\nUpgrade in Settings → Pro.');
        await refresh(snap);
      }
    });
    tabs.appendChild(b);
  }
  const actions = document.createElement('div');
  actions.className = 'tab-actions';
  actions.innerHTML = `
    <button class="icon-btn" id="addFolderBtn" title="New stack">📁+</button>
    <button class="icon-btn" id="addItemsBtn" title="Add items">＋</button>
  `;
  tabs.appendChild(actions);
  $('addFolderBtn').onclick = async () => {
    const presetList = STACK_PRESETS.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const pick = prompt(
      `New stack — enter a name, or 1–${STACK_PRESETS.length} for a preset:\n${presetList}`,
      'Coding'
    );
    if (!pick) return;
    let name = pick.trim();
    let symbol = 'folder';
    const n = parseInt(name, 10);
    if (n >= 1 && n <= STACK_PRESETS.length) {
      name = STACK_PRESETS[n - 1].name;
      symbol = STACK_PRESETS[n - 1].symbol;
    } else {
      const lower = name.toLowerCase();
      const match = STACK_PRESETS.find((p) => p.name.toLowerCase() === lower);
      if (match) symbol = match.symbol;
    }
    const snap = await clutterDock.addFolder(name, symbol);
    if (snap && snap.ok === false && snap.hitLimit) {
      alert((snap.message || 'Stack limit reached.') + '\n\nSettings → Pro · test key SDPRO-TEST-UNLOCK-2026');
      return;
    }
    await refresh(snap.state ? snap : snap.snapshot || (await clutterDock.getSnapshot()));
  };
  $('addItemsBtn').onclick = async () => {
    const snap = await clutterDock.pickAndAdd();
    if (snap?._limitMessage) {
      alert(snap._limitMessage + '\n\nUpgrade in Settings → Pro.');
    }
    await refresh(snap);
  };
  // tier badge
  const badge = document.createElement('span');
  badge.style.cssText =
    'font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(15,23,42,.08);margin-left:4px';
  badge.textContent = snapshot.gate?.isPro ? 'Pro' : 'Free';
  if (snapshot.gate?.isPro) badge.style.background = 'rgba(251,146,60,.35)';
  tabs.appendChild(badge);
}

function renderContent() {
  const content = $('content');
  const folder = selectedFolder();
  const items = itemsForView();
  content.classList.remove('drop-active');

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
      await refresh(await clutterDock.pickAndAdd());
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
          <div class="name">${escapeHtml(item.name)}</div>
          <div class="sub">${escapeHtml(item._folderName || item.kind + ' · ' + item.path)}</div>
        </div>`;
      wireItem(row, item, folder);
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
        <div class="tile-name">${escapeHtml(item.name)}</div>`;
      wireItem(tile, item, folder);
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
          await refresh(await clutterDock.reorderItem(from, toIndex, folder.id));
          selectedId = from;
          dragId = null;
        });
      }
      grid.appendChild(tile);
    }
  }
}

function wireItem(el, item, folder) {
  el.onclick = async () => {
    selectedId = item.id;
    renderContent();
    const res = await clutterDock.openItem(item);
    if (!res?.ok && res?.error) alert(res.error);
    else await refresh();
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
    '↑↓←→ move · Enter open · Esc close · Ctrl+Shift+D toggle · Ctrl+G all folders';
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
    await refresh(await clutterDock.updatePrefs({ hasCompletedOnboarding: true }));
  };
  $('obAdd').onclick = async () => {
    await clutterDock.updatePrefs({ hasCompletedOnboarding: true });
    await refresh(await clutterDock.pickAndAdd());
  };
  $('obSettings').onclick = async () => {
    await clutterDock.updatePrefs({ hasCompletedOnboarding: true });
    await clutterDock.openSettings();
  };
}

function showItemMenu(x, y, item, folder) {
  const ctx = $('ctx');
  ctx.hidden = false;
  ctx.style.left = x + 'px';
  ctx.style.top = y + 'px';
  const canReorder = folder && folder.smartKind === 'none';
  ctx.innerHTML = `
    <button data-a="open">Open</button>
    <button data-a="reveal">Show in Explorer</button>
    ${canReorder ? '<button data-a="left">Move left</button><button data-a="right">Move right</button>' : ''}
    ${canReorder ? '<button class="danger" data-a="remove">Remove</button>' : ''}
  `;
  ctx.onclick = async (e) => {
    const a = e.target.getAttribute('data-a');
    if (!a) return;
    ctx.hidden = true;
    if (a === 'open') await clutterDock.openItem(item);
    if (a === 'reveal') await clutterDock.revealItem(item);
    if (a === 'left') await refresh(await clutterDock.nudgeItem(item.id, -1, folder.id));
    if (a === 'right') await refresh(await clutterDock.nudgeItem(item.id, 1, folder.id));
    if (a === 'remove') await refresh(await clutterDock.removeItem(item.id, folder.id));
  };
}

function showFolderMenu(x, y, folder) {
  const ctx = $('ctx');
  ctx.hidden = false;
  ctx.style.left = x + 'px';
  ctx.style.top = y + 'px';
  ctx.innerHTML = `
    <button data-a="grid">Grid view</button>
    <button data-a="list">List view</button>
    ${folder.smartKind === 'none' ? '<button data-a="rename">Rename stack…</button>' : ''}
    ${folder.smartKind === 'none' ? '<button data-a="symbol">Change symbol…</button>' : ''}
    ${folder.smartKind === 'none' ? '<button class="danger" data-a="delete">Delete stack</button>' : ''}
  `;
  ctx.onclick = async (e) => {
    const a = e.target.getAttribute('data-a');
    if (!a) return;
    ctx.hidden = true;
    if (a === 'grid') await refresh(await clutterDock.setFolderView(folder.id, 'grid'));
    if (a === 'list') await refresh(await clutterDock.setFolderView(folder.id, 'list'));
    if (a === 'rename') {
      const name = prompt('Rename stack (e.g. Coding, Work)', folder.name);
      if (name) await refresh(await clutterDock.renameFolder(folder.id, name));
    }
    if (a === 'symbol') {
      const keys = Object.keys(STACK_EMOJI);
      const list = keys.map((k, i) => `${i + 1}. ${STACK_EMOJI[k]} ${k}`).join('\n');
      const pick = prompt(`Symbol for “${folder.name}”:\n${list}`, folder.symbol || 'folder');
      if (!pick) return;
      let symbol = pick.trim().toLowerCase();
      const n = parseInt(symbol, 10);
      if (n >= 1 && n <= keys.length) symbol = keys[n - 1];
      if (!STACK_EMOJI[symbol]) {
        alert('Unknown symbol');
        return;
      }
      await refresh(await clutterDock.setFolderSymbol(folder.id, symbol));
    }
    if (a === 'delete') await refresh(await clutterDock.deleteFolder(folder.id));
  };
}

async function addUrlPrompt() {
  const url = prompt('URL', 'https://');
  if (url) await refresh(await clutterDock.addURL(url));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  const files = [...(e.dataTransfer.files || [])].map((f) => f.path).filter(Boolean);
  if (files.length) {
    const snap = await clutterDock.addPaths(files);
    if (snap?._limitMessage) alert(snap._limitMessage + '\n\nUpgrade in Settings → Pro.');
    await refresh(snap);
    return;
  }
  // Browser link or pasted URL text
  const uri =
    e.dataTransfer.getData('text/uri-list') ||
    e.dataTransfer.getData('text/plain') ||
    '';
  const first = uri.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'));
  if (first && (first.includes('://') || first.includes('.'))) {
    const snap = await clutterDock.addURL(first);
    if (snap?._limitMessage) alert(snap._limitMessage + '\n\nUpgrade in Settings → Pro.');
    await refresh(snap);
  }
});

$('search').addEventListener('input', async (e) => {
  searchText = e.target.value;
  await refresh();
});
$('searchAll').onclick = async () => {
  if (!snapshot?.gate?.canUseGlobalSearch) {
    alert(
      'Search all folders is a Pro feature.\n\nOpen Settings → Pro to activate.\nTest key: SDPRO-TEST-UNLOCK-2026'
    );
    return;
  }
  searchGlobal = !searchGlobal;
  await refresh();
};
$('settingsBtn').onclick = () => clutterDock.openSettings();
$('helpBtn').onclick = () => {
  alert(
    'ClutterDock keyboard\n\n' +
      'Ctrl+Shift+D — Open/close\n' +
      'Esc — Close\n' +
      'Enter — Open selected\n' +
      'Arrows — Move selection\n' +
      'Ctrl+G — Toggle search all\n' +
      'Alt+←/→ — Reorder item'
  );
};

document.addEventListener('click', (e) => {
  if (!$('ctx').contains(e.target)) $('ctx').hidden = true;
});

document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    if (!snapshot?.prefs?.hasCompletedOnboarding) {
      await refresh(await clutterDock.updatePrefs({ hasCompletedOnboarding: true }));
      return;
    }
    await clutterDock.hidePanel();
    return;
  }
  if (e.key === 'g' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    searchGlobal = !searchGlobal;
    await refresh();
    return;
  }
  const items = itemsForView();
  if (!items.length) return;
  const idx = Math.max(0, items.findIndex((i) => i.id === selectedId));
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (e.altKey && selectedFolder()?.smartKind === 'none' && selectedId) {
      await refresh(await clutterDock.nudgeItem(selectedId, 1, selectedFolder().id));
    } else {
      selectedId = items[Math.min(items.length - 1, idx + 1)].id;
      renderContent();
    }
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (e.altKey && selectedFolder()?.smartKind === 'none' && selectedId) {
      await refresh(await clutterDock.nudgeItem(selectedId, -1, selectedFolder().id));
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
