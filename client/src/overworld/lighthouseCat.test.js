import { describe, expect, it } from 'vitest';
import * as lighthouseRenderer from './lighthouseRoomRenderer.js';

describe('lighthouse cat animation', () => {
  it('wakes briefly during its idle cycle and then curls back to sleep', () => {
    const resting = lighthouseRenderer.getLighthouseCatPose?.(0);
    const awake = lighthouseRenderer.getLighthouseCatPose?.(7.2);
    const restingAgain = lighthouseRenderer.getLighthouseCatPose?.(9.6);

    expect(resting).toMatchObject({ headLift: 0, eyesOpen: false });
    expect(awake?.headLift).toBeGreaterThan(0.9);
    expect(awake?.eyesOpen).toBe(true);
    expect(restingAgain).toMatchObject({ headLift: 0, eyesOpen: false });
  });

  it('uses visible but bounded breathing, tail and ear movements', () => {
    const breathing = lighthouseRenderer.getLighthouseCatPose?.(0.8);
    const earFlick = lighthouseRenderer.getLighthouseCatPose?.(3);
    const tailFlick = lighthouseRenderer.getLighthouseCatPose?.(4.8);

    expect(breathing?.bodyRise).toBeGreaterThan(0.7);
    expect(earFlick?.earTwitch).toBeGreaterThan(0.9);
    expect(Math.abs(tailFlick?.tailSwing)).toBeGreaterThan(1.5);

    for (let time = 0; time <= 9.6; time += 0.1) {
      const pose = lighthouseRenderer.getLighthouseCatPose?.(time);
      expect(pose?.bodyRise).toBeGreaterThanOrEqual(-0.8);
      expect(pose?.bodyRise).toBeLessThanOrEqual(0.8);
      expect(pose?.tailSwing).toBeGreaterThanOrEqual(-3);
      expect(pose?.tailSwing).toBeLessThanOrEqual(3);
      expect(pose?.earTwitch).toBeGreaterThanOrEqual(0);
      expect(pose?.earTwitch).toBeLessThanOrEqual(1);
    }
  });

  it('blinks once while its head remains raised', () => {
    const beforeBlink = lighthouseRenderer.getLighthouseCatPose?.(7.4);
    const blinking = lighthouseRenderer.getLighthouseCatPose?.(7.6);

    expect(beforeBlink).toMatchObject({ headLift: 1, eyesOpen: true });
    expect(blinking).toMatchObject({ headLift: 1, eyesOpen: false });
  });
});
