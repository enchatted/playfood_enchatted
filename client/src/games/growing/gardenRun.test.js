import { describe, it, expect } from 'vitest';
import {
  maxPossibleHealthy, isRunLost, healthyPlantCount, waterPhaseNext, gardenBarProgress,
} from './gardenRun.js';

// Check whether the remaining plants can still meet the harvest goal.
const plot = (over = {}) => ({ seed: null, health: 0, wilted: false, harvested: false, ...over });
const planted = (n, over = {}) => Array.from({ length: n }, () => plot({ seed: { id: 'x' }, ...over }));
const empty = (n) => Array.from({ length: n }, () => plot());

describe('maxPossibleHealthy / isRunLost', () => {
  it('a fresh garden can still reach all 8', () => {
    expect(maxPossibleHealthy(empty(36), 0)).toBe(8);
    expect(isRunLost(empty(36), 0)).toBe(false);
  });

  it('3 wrong-season plantings leave exactly 5 — still winnable', () => {
    const plots = [...planted(3, { wilted: true }), ...empty(33)];
    expect(maxPossibleHealthy(plots, 3)).toBe(5);
    expect(isRunLost(plots, 3)).toBe(false);
  });

  it('the 4th wrong-season planting makes 5 unreachable, whatever came before', () => {
    const early = [...planted(4, { wilted: true }), ...empty(32)];
    expect(maxPossibleHealthy(early, 4)).toBe(4);
    expect(isRunLost(early, 4)).toBe(true);
    const late = [...planted(3, { health: 0 }), ...planted(4, { wilted: true }), ...empty(29)];
    expect(maxPossibleHealthy(late, 7)).toBe(4);
    expect(isRunLost(late, 7)).toBe(true);
  });

  it('correctly planted, still unwatered plants count (point 3)', () => {
    const plots = [...planted(4, { health: 0 }), ...planted(3, { wilted: true }), ...empty(29)];
    expect(maxPossibleHealthy(plots, 7)).toBe(5);
    expect(isRunLost(plots, 7)).toBe(false);
  });

  it('healthy harvests already in the basket count, composted ones do not', () => {
    const plots = [
      ...planted(2, { health: 2, harvested: true }),
      ...planted(3, { health: 2 }),
      ...planted(3, { wilted: true, harvested: true }),
    ];
    expect(maxPossibleHealthy(plots, 8)).toBe(5);
    expect(isRunLost(plots, 8)).toBe(false);
  });

  it('honours other thresholds when asked', () => {
    const plots = [...planted(4, { wilted: true }), ...empty(32)];
    expect(isRunLost(plots, 4, { passHarvests: 4 })).toBe(false);
  });
});

describe('waterPhaseNext (point Γ)', () => {
  it('stays in WATER while a live plant needs water', () => {
    expect(waterPhaseNext([...planted(1, { health: 1 }), ...planted(2, { wilted: true })])).toBe(null);
  });

  it('moves to HARVEST when nothing is left to water but something to harvest', () => {
    expect(waterPhaseNext(planted(3, { health: 2 }))).toBe('HARVEST');
  });

  it('moves to HARVEST when every plant wilted — the old build stuck here', () => {
    expect(waterPhaseNext([...planted(8, { wilted: true }), ...empty(28)])).toBe('HARVEST');
  });

  it('reports DONE when nothing is left to water, harvest or compost', () => {
    expect(waterPhaseNext(planted(8, { health: 2, harvested: true }))).toBe('DONE');
    expect(waterPhaseNext(empty(36))).toBe('DONE');
  });
});

describe('gardenBarProgress', () => {
  const plots = [...planted(3, { health: 0 }), ...planted(1, { wilted: true }), ...empty(32)];

  it('PLANT: healthy plants and plantings left', () => {
    expect(gardenBarProgress({ phase: 'PLANT', plots, plantedCount: 4, healthyHarvests: 0 }))
      .toEqual({ key: 'garden.bar.plant_progress', values: { healthy: 3, left: 4 } });
  });

  it('WATER: healthy plants only', () => {
    expect(gardenBarProgress({ phase: 'WATER', plots, plantedCount: 8, healthyHarvests: 0 }))
      .toEqual({ key: 'garden.bar.water_progress', values: { healthy: 3 } });
  });

  it('HARVEST: healthy harvests against the goal', () => {
    expect(gardenBarProgress({ phase: 'HARVEST', plots, plantedCount: 8, healthyHarvests: 2 }))
      .toEqual({ key: 'garden.bar.harvest_progress', values: { done: 2, goal: 5 } });
  });

  it('healthyPlantCount ignores empty and wilted plots', () => {
    expect(healthyPlantCount(plots)).toBe(3);
  });
});
