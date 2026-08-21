#!/usr/bin/env node
const assert = require('assert');
const {
  dockEdge,
  origin,
  clamp,
} = require('../src/placement');

const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
const workArea = { x: 0, y: 0, width: 1920, height: 1040 }; // 40px taskbar at bottom

assert.strictEqual(dockEdge(workArea, bounds), 'bottom', 'bottom taskbar inferred');

const atIcon = origin({
  panelWidth: 480,
  panelHeight: 520,
  workArea,
  displayBounds: bounds,
  mode: 'dock',
  source: 'taskbar',
  mouse: { x: 800, y: 1060 },
  trayBounds: null,
  savedOrigin: null,
  lastIcon: null,
});
assert.ok(Math.abs(atIcon.x - (800 - 240)) < 2, `taskbar click centers on icon (got ${atIcon.x})`);
assert.ok(atIcon.y + 520 <= workArea.y + workArea.height + 1, 'panel sits above the taskbar');

const hotkey = origin({
  panelWidth: 480,
  panelHeight: 520,
  workArea,
  displayBounds: bounds,
  mode: 'dock',
  source: 'hotkey',
  mouse: { x: 900, y: 400 },
  trayBounds: null,
  savedOrigin: null,
  lastIcon: { x: 800, y: 1060 },
});
assert.strictEqual(hotkey.x, atIcon.x, 'hotkey reuses last taskbar icon x');
assert.strictEqual(hotkey.y, atIcon.y, 'hotkey reuses taskbar edge');

const custom = origin({
  panelWidth: 480,
  panelHeight: 520,
  workArea,
  displayBounds: bounds,
  mode: 'custom',
  source: 'hotkey',
  mouse: { x: 10, y: 10 },
  trayBounds: null,
  savedOrigin: { x: 300, y: 200 },
  lastIcon: null,
});
assert.strictEqual(custom.x, 300, 'custom restores x');
assert.strictEqual(custom.y, 200, 'custom restores y');

const tray = origin({
  panelWidth: 480,
  panelHeight: 520,
  workArea,
  displayBounds: bounds,
  mode: 'dock',
  source: 'tray',
  mouse: { x: 1880, y: 1060 },
  trayBounds: { x: 1860, y: 1048, width: 24, height: 24 },
  savedOrigin: null,
  lastIcon: null,
});
assert.ok(tray.x + 480 <= workArea.x + workArea.width, 'tray panel stays on screen');
assert.ok(Math.abs(tray.x + 240 - (1860 + 12)) < 30 || tray.x > 1000, 'tray click aligns toward the tray');

const off = clamp(-400, 5000, 480, 520, workArea);
assert.ok(off.x >= workArea.x, 'clamp left');
assert.ok(off.y + 520 <= workArea.y + workArea.height + 1, 'clamp bottom');

const leftWork = { x: 72, y: 0, width: 1848, height: 1080 };
const leftBounds = { x: 0, y: 0, width: 1920, height: 1080 };
assert.strictEqual(dockEdge(leftWork, leftBounds), 'left', 'left taskbar inferred');
const left = origin({
  panelWidth: 480,
  panelHeight: 520,
  workArea: leftWork,
  displayBounds: leftBounds,
  mode: 'dock',
  source: 'taskbar',
  mouse: { x: 20, y: 400 },
  trayBounds: null,
  savedOrigin: null,
  lastIcon: null,
});
assert.ok(left.x >= leftWork.x, 'left taskbar panel is inside work area');

console.log('placement tests passed');
