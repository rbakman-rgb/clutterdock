#!/usr/bin/env node
const assert = require('assert');
const { clampPanelToWorkArea, DEFAULT_WIDTH, DEFAULT_HEIGHT } = require('../src/panel-bounds');

const laptop = { x: 0, y: 0, width: 1280, height: 720 };

// A panel taller than the work area used to be pushed above the screen.
const huge = clampPanelToWorkArea(100, 100, 900, 1100, laptop);
assert.ok(huge.y >= 0, `top escaped: ${huge.y}`);
assert.ok(huge.x >= 0, `left escaped: ${huge.x}`);
assert.ok(huge.y + huge.height <= laptop.height, `bottom ${huge.y + huge.height}`);
assert.ok(huge.x + huge.width <= laptop.width, `right ${huge.x + huge.width}`);
assert.ok(huge.height <= laptop.height, 'height not capped');
assert.ok(huge.width <= laptop.width, 'width not capped');

// A normal panel stays near the point we asked for.
const normal = clampPanelToWorkArea(400, 80, DEFAULT_WIDTH, DEFAULT_HEIGHT, laptop);
assert.strictEqual(normal.width, DEFAULT_WIDTH);
assert.strictEqual(normal.height, DEFAULT_HEIGHT);
assert.strictEqual(normal.x, 400);
assert.strictEqual(normal.y, 80);

// A saved spot on a monitor that is gone gets pulled onto this one.
const off = clampPanelToWorkArea(-4000, 9000, 480, 520, laptop);
assert.ok(off.x >= 0 && off.x + off.width <= laptop.width, `x ${off.x}`);
assert.ok(off.y >= 0 && off.y + off.height <= laptop.height, `y ${off.y}`);

// Secondary display whose origin is not zero.
const side = { x: 1920, y: 0, width: 800, height: 600 };
const sideFit = clampPanelToWorkArea(5000, -20, 2000, 2000, side);
assert.ok(sideFit.x >= side.x, `side x ${sideFit.x}`);
assert.ok(sideFit.y >= side.y, `side y ${sideFit.y}`);
assert.ok(sideFit.x + sideFit.width <= side.x + side.width, 'side right');
assert.ok(sideFit.y + sideFit.height <= side.y + side.height, 'side bottom');

console.log('panel bounds tests passed');
