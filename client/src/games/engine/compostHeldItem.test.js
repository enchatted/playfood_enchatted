// The carried item must leave the bin name visible.
import { describe, it, expect } from 'vitest';
import { GAME_ROOMS } from './gameRoomData.js';
import { binLabelZones, heldItemPlacement, frontHeldBox } from './compostCreatorRenderer.js';
import { OX, OY } from './gameRoomRenderer.js';

const ROOM = Object.values(GAME_ROOMS).find((r) => Array.isArray(r.bins) && r.bins.length === 5 && r.bins.some((b) => b.id === 'carton'));
const TS = 32;
const at = (col, row, item = { id: 'milk_carton' }) => ({
  heldItem: item, player: { col, row, pixelX: col * TS, pixelY: row * TS },
});
const overlap = (a, z) => a.l < z.r && a.r > z.l && a.t < z.b && a.b > z.t;
const aboveBox = (s) => {
  const px = OX + s.player.pixelX + TS / 2; const py = OY + s.player.pixelY;
  return { l: px - 11, r: px + 11, t: py - 26, b: py - 4 };
};

describe('Compost Creator — held item vs bin labels', () => {
  it('the backyard room has the 5 bins', () => {
    expect(ROOM).toBeTruthy();
    expect(ROOM.bins.map((b) => b.id).sort()).toEqual(['aluminium', 'battery', 'carton', 'compost', 'plastic']);
  });

  for (const id of ['compost', 'plastic', 'carton', 'aluminium', 'battery']) {
    it(`${id}: standing under the bin → carried in front, clear of the label`, () => {
      const bin = ROOM.bins.find((b) => b.id === id);
      const cols = [...new Set(bin.tiles.map((t) => t.col))];
      const below = Math.max(...bin.tiles.map((t) => t.row)) + 1;
      const zone = binLabelZones(ROOM).find((z) => z.id === id);
      for (const col of cols) {
        for (const item of [{ id: 'milk_carton', icon: 'milkCarton' }, { id: 'juice_box', emoji: '🧃' }]) {
          const s = at(col, below, item);
          // negative control: the old above-head position DOES cover the label
          expect(overlap(aboveBox(s), zone), `${id} col ${col}: old position covers the label`).toBe(true);
          expect(heldItemPlacement(s, ROOM)).toBe('front');
          const f = frontHeldBox(s);
          for (const z of binLabelZones(ROOM)) expect(overlap(f, z), `${id} col ${col}: front box clear of ${z.id}`).toBe(false);
        }
      }
    });
  }

  it('away from the bins the shared above-head carry is unchanged', () => {
    expect(heldItemPlacement(at(9, 8), ROOM)).toBe('above');
    expect(heldItemPlacement(at(4, 12), ROOM)).toBe('above');
  });

  it('no item → nothing to draw', () => {
    expect(heldItemPlacement({ heldItem: null, player: { pixelX: 0, pixelY: 0 } }, ROOM)).toBe(null);
  });
});
