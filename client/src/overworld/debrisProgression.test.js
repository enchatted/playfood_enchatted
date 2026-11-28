import { describe, expect, it, vi } from 'vitest';
import * as overworldRenderer from './overworldRenderer.js';

const ALL_MISSIONS_COMPLETE = {
  foodwaste: [1, 2, 3],
  local: [1, 2, 3],
  growing: [1, 2, 3],
  circular: [1, 2, 3],
};

describe('progressive overworld debris density', () => {
  it.each([
    [8, 0],
    [7, 1],
    [7, 3],
    [6, 4],
    [6, 6],
    [5, 7],
    [5, 9],
    [4, 10],
    [4, 11],
    [2, 12],
  ])('targets %i visible pieces after %i completed missions', (target, completed) => {
    const getDebrisTarget = overworldRenderer.getDebrisTarget;
    expect(getDebrisTarget, 'getDebrisTarget export is missing').toBeDefined();

    expect(getDebrisTarget(completed)).toBe(target);
  });

  it.each([
    ['1-3 band', {
      foodwaste: [1, 2], local: [], growing: [], circular: [],
    }, 7],
    ['4-6 band', {
      foodwaste: [1, 2, 3], local: [1, 2], growing: [], circular: [],
    }, 6],
    ['7-9 band', {
      foodwaste: [1, 2, 3], local: [1, 2, 3], growing: [1, 2], circular: [],
    }, 5],
    ['10-11 band', {
      foodwaste: [1, 2, 3], local: [1, 2, 3], growing: [1, 2, 3], circular: [1],
    }, 4],
  ])('derives the %s target from the runtime four-array mission shape', (
    _band,
    completedMissions,
    target,
  ) => {
    expect(overworldRenderer.getDebrisTarget(completedMissions)).toBe(target);
  });

  it('retires excess visible debris from the end without changing carried cargo', () => {
    const debris = Array.from({ length: 8 }, (_, index) => ({ id: index + 1 }));
    const state = {
      debris: [...debris],
      trashCargo: 5,
      player: { col: 28, row: 34 },
    };

    overworldRenderer.spawnDebris(state, ALL_MISSIONS_COMPLETE);

    expect(state.debris).toEqual(debris.slice(0, 2));
    expect(state.trashCargo).toBe(5);
  });

  it('replenishes the all-complete sea from zero through one to two without changing cargo', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = {
      debris: [],
      trashCargo: 2,
      player: { col: 28, row: 34 },
    };

    try {
      overworldRenderer.spawnDebris(state, ALL_MISSIONS_COMPLETE);
      expect(state.debris).toHaveLength(1);
      expect(state.trashCargo).toBe(2);

      overworldRenderer.spawnDebris(state, ALL_MISSIONS_COMPLETE);
      expect(state.debris).toHaveLength(2);
      expect(state.trashCargo).toBe(2);

      overworldRenderer.spawnDebris(state, ALL_MISSIONS_COMPLETE);
      expect(state.debris).toHaveLength(2);
      expect(state.trashCargo).toBe(2);
    } finally {
      random.mockRestore();
    }
  });

  it('awards exactly five points for each delivered trash item', () => {
    const state = {
      trashCargo: 3,
      cargoFull: true,
      particles: [],
      player: { pixelX: 0, pixelY: 0 },
    };

    expect(overworldRenderer.recycleTrash(state)).toEqual({ recycled: 3, points: 15 });
  });
});
