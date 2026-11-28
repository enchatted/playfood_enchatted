import { describe, expect, it } from 'vitest';
import { checkDebrisCollection, renderHUD } from '../overworld/overworldRenderer.js';
import { syncWorldBoatState } from './WorldMap.jsx';

function makeHudContext() {
  const labels = [];
  const context = {
    arc() {},
    beginPath() {},
    closePath() {},
    fill() {},
    fillRect() {},
    fillText(text) { labels.push(String(text)); },
    lineTo() {},
    measureText(text) { return { width: String(text).length * 8 }; },
    moveTo() {},
    quadraticCurveTo() {},
    restore() {},
    save() {},
    stroke() {},
  };
  return { context, labels };
}

describe('World Map boat synchronization', () => {
  it.each([[0, 3], [1, 5], [2, 8], [3, 12], [4, 18]])(
    'syncs tier %i with capacity %i',
    (tier, capacity) => {
      const state = { trashCargo: 1, player: { col: 4, row: 4 } };

      expect(syncWorldBoatState(state, tier)).toBe(state);
      expect(state).toMatchObject({
        boatTier: tier,
        trashCapacity: capacity,
        trashCargo: 1,
      });
    },
  );

  it('restores the shared cargo when the World Map canvas is rebuilt', () => {
    const state = { trashCargo: 0, player: { col: 4, row: 4 } };

    syncWorldBoatState(state, 2, 5);

    expect(state).toMatchObject({
      boatTier: 2,
      trashCapacity: 8,
      trashCargo: 5,
      cargoFull: false,
    });
  });

  it('renders the Guardian cargo capacity in the World Map HUD', () => {
    const state = {
      audioButtonHover: false,
      exitButtonHover: false,
      time: 10,
      trashCargo: 0,
    };
    syncWorldBoatState(state, 4);
    const { context, labels } = makeHudContext();

    renderHUD(
      context,
      state,
      0,
      { growing: [], local: [], foodwaste: [], circular: [] },
      { hubTitle: 'Map', exitLabel: 'Exit', controlHint: '' },
      0,
    );

    expect(labels).toContain('🗑️ 0/18');
  });

  it('collects eighteen pieces with the Guardian and leaves the nineteenth in the sea', () => {
    const state = {
      cargoFull: false,
      debris: Array.from({ length: 19 }, () => ({ x: 16, y: 16 })),
      debrisCollected: 0,
      particles: [],
      player: { pixelX: 0, pixelY: 0 },
      time: 1,
      trashCargo: 0,
    };
    syncWorldBoatState(state, 4);

    const collectionResults = Array.from(
      { length: 19 },
      () => checkDebrisCollection(state),
    );

    expect(collectionResults.filter(Boolean)).toHaveLength(18);
    expect(collectionResults.at(-1)).toBe(false);
    expect(state).toMatchObject({
      cargoFull: true,
      debrisCollected: 18,
      trashCapacity: 18,
      trashCargo: 18,
    });
    expect(state.debris).toHaveLength(1);
  });
});
