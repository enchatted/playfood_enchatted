import { describe, expect, it, vi } from 'vitest';
import { GAME_ROOMS } from './gameRoomData.js';
import { CANVAS_H } from '../../overworld/overworldData.js';
import {
  getFridgeStateBadgeLayout,
  getFridgeStateBadgeCenter,
  getFridgeFeedbackCardY,
  getFridgeStoredItemSlots,
  getFridgeStationVisualGeometry,
  renderStateBadges,
} from './fridgeManagerRenderer.js';

describe('FridgeManager responsive presentation', () => {
  it('keeps state badges inside one food slot so neighbouring labels cannot overlap', () => {
    const shortLabel = getFridgeStateBadgeLayout(34);
    const longLabel = getFridgeStateBadgeLayout(92);

    expect(shortLabel.width).toBeGreaterThanOrEqual(28);
    expect(longLabel.width).toBeLessThanOrEqual(56);
    expect(longLabel.maxTextWidth).toBeLessThan(longLabel.width);

    const foodSpacing = 2 * 32;
    expect(foodSpacing - longLabel.width).toBeGreaterThanOrEqual(8);
  });

  it('keeps edge badges on the preparation counter', () => {
    const room = GAME_ROOMS.FridgeManager;
    const badgeWidth = 56;

    expect(getFridgeStateBadgeCenter(496, badgeWidth, room)).toBe(513);
    expect(getFridgeStateBadgeCenter(784, badgeWidth, room)).toBe(767);
    expect(getFridgeStateBadgeCenter(640, badgeWidth, room)).toBe(640);
  });

  it('draws only the two decision-changing state labels', () => {
    const renderedText = [];
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
      moveTo: vi.fn(), arcTo: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      measureText: (text) => ({ width: String(text).length * 7 }),
      fillText: (text) => renderedText.push(text),
    };
    const state = {
      counterItems: [
        { col: 5, row: 6, stateLabelKey: null, picked: false },
        { col: 7, row: 6, stateLabelKey: 'fridge.state_day_old', picked: false },
        { col: 9, row: 6, stateLabelKey: 'fridge.state_thawed', picked: false },
      ],
      floorItems: [],
      heldItem: null,
    };
    const labels = {
      'fridge.state_day_old': 'χθεσινό',
      'fridge.state_thawed': 'ξεπαγωμένο',
    };

    renderStateBadges(ctx, state, (key) => labels[key]);

    expect(renderedText).toEqual(['χθεσινό', 'ξεπαγωμένο']);
  });

  // Long tags wrap inside the label. A held item has no shelf label.
  it('wraps a long state tag onto two lines within the pill and skips the held item', () => {
    const drawn = [];
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
      moveTo: vi.fn(), arcTo: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      measureText: (text) => ({ width: String(text).length * 6 }),
      fillText: (text, x, y, maxWidth) => drawn.push({ text, maxWidth }),
    };
    const state = {
      counterItems: [{ col: 7, row: 6, stateLabelKey: 'fridge.state_day_old', picked: false }],
      floorItems: [],
      heldItem: { stateLabelKey: 'fridge.state_thawed' },
      player: { pixelX: 0, pixelY: 0 },
    };
    renderStateBadges(ctx, state, () => 'πάνω από 1 μέρα');

    expect(drawn.map((d) => d.text)).toEqual(['πάνω από', '1 μέρα']);
    const { maxTextWidth } = getFridgeStateBadgeLayout(48, 2);
    for (const d of drawn) expect(d.maxWidth).toBeLessThanOrEqual(maxTextWidth);
  });

  it('insets the visible appliance shell without shrinking its interaction footprint', () => {
    const freezer = GAME_ROOMS.FridgeManager.bins.find((bin) => bin.id === 'freezer');
    const geometry = getFridgeStationVisualGeometry(freezer);

    expect(geometry.footprint).toMatchObject({ width: 96, height: 96 });
    expect(geometry.shell.width).toBeLessThan(geometry.footprint.width);
    expect(geometry.shell.height).toBeLessThan(geometry.footprint.height);
    expect(geometry.shell.left).toBeGreaterThan(geometry.footprint.left);
    expect(freezer.tiles).toHaveLength(9);
  });

  it('uses fixed storage slots that respect each appliance shelves', () => {
    const shell = { left: 100, top: 50, width: 74, height: 86 };
    const cupboardSlots = getFridgeStoredItemSlots('cupboard', shell);
    const fridgeSlots = getFridgeStoredItemSlots('fridge', shell);

    expect(cupboardSlots).toHaveLength(4);
    expect(new Set(cupboardSlots.map(({ x }) => x))).toHaveLength(2);
    expect(new Set(cupboardSlots.map(({ y }) => y))).toHaveLength(2);
    expect(fridgeSlots).toHaveLength(6);
    expect(new Set(fridgeSlots.map(({ x }) => x))).toHaveLength(3);
    expect(new Set(fridgeSlots.map(({ y }) => y))).toHaveLength(2);
  });

  it('keeps the appliance chrome visually lighter than the interaction area', () => {
    const cupboard = GAME_ROOMS.FridgeManager.bins.find((bin) => bin.id === 'cupboard');
    const geometry = getFridgeStationVisualGeometry(cupboard);

    expect(geometry.shell.width).toBeLessThanOrEqual(geometry.footprint.width - 20);
    expect(geometry.shell.height).toBeLessThanOrEqual(geometry.footprint.height - 8);
  });

  it('centres short and long feedback cards inside the game canvas', () => {
    expect(getFridgeFeedbackCardY(240)).toBe((CANVAS_H - 240) / 2);
    expect(getFridgeFeedbackCardY(520)).toBe((CANVAS_H - 520) / 2);
  });
});
