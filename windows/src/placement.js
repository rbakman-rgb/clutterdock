'use strict';

const PAD = 8;

function dockEdge(workArea, bounds) {
  const bottom = bounds.y + bounds.height - (workArea.y + workArea.height);
  const left = workArea.x - bounds.x;
  const right = bounds.x + bounds.width - (workArea.x + workArea.width);
  const top = workArea.y - bounds.y;
  const maxGap = Math.max(bottom, left, right, top);
  if (maxGap <= 8) return 'none';
  if (bottom >= maxGap) return 'bottom';
  if (left >= maxGap) return 'left';
  if (right >= maxGap) return 'right';
  return 'top';
}

function clamp(x, y, width, height, wa) {
  const minX = wa.x + PAD;
  const minY = wa.y + PAD;
  const maxX = Math.max(minX, wa.x + wa.width - width - PAD);
  const maxY = Math.max(minY, wa.y + wa.height - height - PAD);
  return {
    x: Math.round(Math.min(Math.max(x, minX), maxX)),
    y: Math.round(Math.min(Math.max(y, minY), maxY)),
  };
}

function nearEdge(mouse, edge, workArea) {
  const slop = 96;
  if (!mouse) return false;
  switch (edge) {
    case 'bottom':
      return mouse.y > workArea.y + workArea.height - slop;
    case 'top':
      return mouse.y < workArea.y + slop;
    case 'left':
      return mouse.x < workArea.x + slop;
    case 'right':
      return mouse.x > workArea.x + workArea.width - slop;
    default:
      return false;
  }
}

function iconPoint({ edge, workArea, source, mouse, trayBounds, lastIcon }) {
  if (source === 'tray' && trayBounds && trayBounds.width > 0) {
    return {
      x: trayBounds.x + trayBounds.width / 2,
      y: trayBounds.y + trayBounds.height / 2,
    };
  }
  if (source === 'taskbar' && mouse) return mouse;
  if (lastIcon && Number.isFinite(lastIcon.x) && Number.isFinite(lastIcon.y)) return lastIcon;
  if (trayBounds && trayBounds.width > 0) {
    return {
      x: trayBounds.x + trayBounds.width / 2,
      y: trayBounds.y + trayBounds.height / 2,
    };
  }
  if (nearEdge(mouse, edge, workArea)) return mouse;
  switch (edge) {
    case 'left':
      return { x: workArea.x, y: workArea.y + workArea.height / 2 };
    case 'right':
      return { x: workArea.x + workArea.width, y: workArea.y + workArea.height / 2 };
    case 'top':
      return { x: workArea.x + workArea.width / 2, y: workArea.y };
    default:
      return { x: workArea.x + workArea.width / 2, y: workArea.y + workArea.height };
  }
}

function besideIcon({ edge, icon, panelWidth, panelHeight, workArea }) {
  let x = icon.x - panelWidth / 2;
  let y;
  switch (edge) {
    case 'top':
      y = workArea.y + PAD;
      break;
    case 'left':
      x = workArea.x + PAD;
      y = icon.y - panelHeight / 2;
      break;
    case 'right':
      x = workArea.x + workArea.width - panelWidth - PAD;
      y = icon.y - panelHeight / 2;
      break;
    default:
      y = workArea.y + workArea.height - panelHeight - PAD;
      break;
  }
  return clamp(x, y, panelWidth, panelHeight, workArea);
}

/**
 * Top-left screen coords (Electron). Default mode sits on the taskbar/tray
 * edge aligned to the icon; custom mode restores a saved origin.
 */
function origin(opts) {
  const {
    panelWidth,
    panelHeight,
    workArea,
    displayBounds,
    mode,
    source,
    mouse,
    trayBounds,
    savedOrigin,
    lastIcon,
  } = opts;

  if (
    mode === 'custom' &&
    savedOrigin &&
    Number.isFinite(savedOrigin.x) &&
    Number.isFinite(savedOrigin.y)
  ) {
    return clamp(savedOrigin.x, savedOrigin.y, panelWidth, panelHeight, workArea);
  }

  const edge = dockEdge(workArea, displayBounds);
  const icon = iconPoint({ edge, workArea, source, mouse, trayBounds, lastIcon });
  return besideIcon({ edge, icon, panelWidth, panelHeight, workArea });
}

function shouldCacheIcon(source, mouse, workArea, displayBounds) {
  if (source === 'tray' || source === 'taskbar') return true;
  return nearEdge(mouse, dockEdge(workArea, displayBounds), workArea);
}

module.exports = {
  PAD,
  dockEdge,
  clamp,
  origin,
  iconPoint,
  besideIcon,
  shouldCacheIcon,
  nearEdge,
};
