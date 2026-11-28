import { describe, expect, it } from 'vitest';
import { getRestorationStage } from './islandRestoration.js';
import { EVOLUTION_DATA } from './overworldRenderer.js';

describe('world-map ecosystem restoration', () => {
  const available = { birds: 2, fish: 3 };

  it('keeps wildlife away until a habitat has returned at 2/3', () => {
    expect(getRestorationStage(0, available)).toMatchObject({ birdCount: 0, fishCount: 0 });
    expect(getRestorationStage(1, available)).toMatchObject({ birdCount: 0, fishCount: 0 });
  });

  it('introduces one bird and one fish at 2/3', () => {
    expect(getRestorationStage(2, available)).toMatchObject({
      birdCount: 1,
      fishCount: 1,
      finalIntensity: 0,
    });
  });

  it('makes 3/3 visibly richer than 2/3', () => {
    const restored = getRestorationStage(3, available);
    expect(restored).toMatchObject({
      birdCount: 2,
      fishCount: 3,
      finalIntensity: 1,
    });
    expect(restored.shoreSparkleCount).toBeGreaterThan(0);
  });

  it('describes Little Gardener with crops, soil and pollinators instead of climate hardware', () => {
    const growing = EVOLUTION_DATA.growing;

    expect(growing).toMatchObject({
      youngCrops: expect.any(Array),
      gardenBeds: expect.any(Array),
      compostBin: expect.any(Object),
      healthySoil: expect.any(Array),
      fruitTrees: expect.any(Array),
      bees: expect.any(Array),
    });
    for (const climateProp of ['solarPanel', 'windTurbine', 'forestTrees', 'co2Banner', 'clouds']) {
      expect(growing).not.toHaveProperty(climateProp);
    }
  });
});
