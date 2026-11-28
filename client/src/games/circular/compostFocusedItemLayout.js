import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { GAME_ROOMS } from '../engine/gameRoomData.js';
import { OX, OY, roomToCanvas } from '../engine/gameRoomRenderer.js';

const ROOM = GAME_ROOMS.CompostCreator;
const GAP = 8;

/** CSS regions outside the fenced playfield, with the visible controls reserved. */
export function compostFocusedItemRegions({ wrapper, canvas, backingWidth, backingHeight, hidpi, hud, controls = [] }) {
  const scale = hidpi ? hidpi.k * canvas.width / backingWidth : Math.min(canvas.width / CANVAS_W, canvas.height / CANVAS_H);
  const originX = canvas.left + (hidpi ? hidpi.ox * canvas.width / backingWidth : (canvas.width - CANVAS_W * scale) / 2);
  const originY = canvas.top + (hidpi ? hidpi.oy * canvas.height / backingHeight : (canvas.height - CANVAS_H * scale) / 2);
  const roomTopLeft = roomToCanvas(ROOM, OX, OY);
  const roomBottomRight = roomToCanvas(ROOM, OX + ROOM.map[0].length * 32, OY + ROOM.map.length * 32);
  const room = { left: originX + roomTopLeft.x * scale, top: originY + roomTopLeft.y * scale, right: originX + roomBottomRight.x * scale };
  const top = Math.max(wrapper.top, hud.bottom) + GAP;
  const topWidth = Math.min(760, wrapper.width - GAP * 2);
  const candidates = [
    { kind: 'letterbox', left: wrapper.left + (wrapper.width - topWidth) / 2, top, width: topWidth, bottom: room.top - GAP },
    { kind: 'left', left: wrapper.left + GAP, top, width: Math.min(240, room.left - wrapper.left - GAP * 2), bottom: wrapper.top + wrapper.height - GAP },
    { kind: 'right', left: Math.max(room.right + GAP, wrapper.left + wrapper.width - GAP - 240), top, width: Math.min(240, wrapper.left + wrapper.width - room.right - GAP * 2), bottom: wrapper.top + wrapper.height - GAP },
  ];
  return candidates.filter(({ width, bottom }) => width > 0 && bottom > top).map((region) => {
    const intersectingControls = controls.filter((control) => control.left < region.left + region.width && control.right > region.left && control.bottom > region.top);
    const bottom = Math.min(region.bottom, ...intersectingControls.map(({ top: controlTop }) => controlTop - GAP));
    return { ...region, height: Math.max(0, bottom - region.top) };
  }).filter(({ height }) => height > 0);
}

/** Measure the real wrapped DOM text at each candidate width; never truncate it. */
export function placeCompostFocusedItem(regions, measureHeight) {
  const measured = regions.map((region) => ({ ...region, textHeight: measureHeight(region.width) }));
  const fitting = measured.find(({ height, textHeight }) => textHeight <= height);
  return fitting ? { ...fitting, fits: true } : measured[0] ? { ...measured[0], fits: false } : null;
}
