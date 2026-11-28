import { describe, expect, it } from 'vitest';
import * as LighthouseRenderer from './lighthouseRoomRenderer.js';

describe('Lighthouse Keeper overlay geometry', () => {
  it.each([
    [427, { body: { x: 615, y: 408, width: 18, height: 12 }, tailTip: { x: 624, y: 424 } }],
    [429, { body: { x: 615, y: 410, width: 18, height: 12 }, tailTip: { x: 624, y: 426 } }],
  ])('keeps the pixel invite anchored above a bobbing Keeper at sprite y=%i', (spriteTopY, expectedInvite) => {
    const layout = LighthouseRenderer.getKeeperOverlayLayout?.({
      cx: 624,
      dy: 432,
      spriteTopY,
      nameWidth: 90,
      playerRect: null,
      inviteVisible: true,
      dialogOpen: false,
    });

    expect(layout?.invite).toEqual(expectedInvite);
    expect(spriteTopY - layout?.invite?.tailTip?.y).toBe(3);
    expect(layout?.showName).toBe(false);
  });

  it.each([
    [{ x: 608, y: 464, width: 32, height: 32 }, false],
    [{ x: 608, y: 481, width: 32, height: 32 }, true],
  ])('shows the name pill only when the player does not overlap it', (playerRect, expectedShowName) => {
    const layout = LighthouseRenderer.getKeeperOverlayLayout?.({
      cx: 624,
      dy: 432,
      spriteTopY: 428,
      nameWidth: 90,
      playerRect,
      inviteVisible: false,
      dialogOpen: false,
    });

    expect(layout?.name).toEqual({ x: 579, y: 466, width: 90, height: 14 });
    expect(layout?.showName).toBe(expectedShowName);
  });
});
