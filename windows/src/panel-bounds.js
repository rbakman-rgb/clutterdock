// Pure geometry for the launcher panel. No Electron types, so the unit
// test can pin the clamp without opening a window.
//
// The old clamp did Math.min(Math.max(pos, min), min + area - size). When the
// panel was larger than the work area, the upper bound fell below the lower
// bound and the window was pushed off the screen.

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 520;

/**
 * Fit a panel into a display work area.
 * @param {number} x desired left
 * @param {number} y desired top
 * @param {number} width desired width
 * @param {number} height desired height
 * @param {{x:number,y:number,width:number,height:number}} area work area
 * @param {number} [margin]
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function clampPanelToWorkArea(x, y, width, height, area, margin = 8) {
  const ax = Number(area?.x) || 0;
  const ay = Number(area?.y) || 0;
  const aw = Math.max(1, Number(area?.width) || 1);
  const ah = Math.max(1, Number(area?.height) || 1);
  const inset = Math.max(0, Math.min(margin, Math.floor(Math.min(aw, ah) / 4)));
  const innerW = Math.max(1, aw - inset * 2);
  const innerH = Math.max(1, ah - inset * 2);
  const w = Math.round(Math.min(Math.max(1, Number(width) || DEFAULT_WIDTH), innerW));
  const h = Math.round(Math.min(Math.max(1, Number(height) || DEFAULT_HEIGHT), innerH));
  const minX = ax + inset;
  const minY = ay + inset;
  const maxX = minX + innerW - w;
  const maxY = minY + innerH - h;
  const cx = maxX < minX ? minX : Math.min(Math.max(Number.isFinite(x) ? x : minX, minX), maxX);
  const cy = maxY < minY ? minY : Math.min(Math.max(Number.isFinite(y) ? y : minY, minY), maxY);
  return { x: Math.round(cx), y: Math.round(cy), width: w, height: h };
}

module.exports = { clampPanelToWorkArea, DEFAULT_WIDTH, DEFAULT_HEIGHT };
