import { describe, expect, it } from 'vitest';
import * as IslandRoomModule from './IslandRoom.jsx';
import * as IslandRoomRenderer from '../overworld/islandRoomRenderer.js';

describe('island mentor artwork', () => {
  it('uses the dedicated Gardener frames on the growing island', () => {
    const gardenerFrames = [{ id: 'gardener-idle-a' }, { id: 'gardener-idle-b' }];
    const genericFrames = [[{ id: 'generic-villager' }]];
    const atlas = {
      gardenerMentor: gardenerFrames,
      ambientNPC: { build: () => genericFrames },
    };

    expect(IslandRoomModule.getIslandMentorSprites).toBeTypeOf('function');
    expect(
      IslandRoomModule.getIslandMentorSprites?.(atlas, 'growing', '#F48FB1'),
    ).toBe(gardenerFrames);
  });

  it('uses the dedicated Market Keeper frames on the local island', () => {
    const gardenerFrames = [{ id: 'gardener-idle-a' }, { id: 'gardener-idle-b' }];
    const marketKeeperFrames = [{ id: 'market-idle-a' }, { id: 'market-idle-b' }];
    const genericFrames = [[{ id: 'generic-villager' }]];
    const atlas = {
      gardenerMentor: gardenerFrames,
      marketKeeper: marketKeeperFrames,
      ambientNPC: {
        build: (color) => (color === '#FFB74D' ? genericFrames : null),
      },
    };

    expect(IslandRoomModule.getIslandMentorSprites).toBeTypeOf('function');
    expect(
      IslandRoomModule.getIslandMentorSprites?.(atlas, 'local', '#FFB74D'),
    ).toBe(marketKeeperFrames);
  });

  it('uses the dedicated Chef frames on the foodwaste island', () => {
    const kitchenChefFrames = [{ id: 'chef-idle-a' }, { id: 'chef-idle-b' }];
    const genericFrames = [[{ id: 'generic-villager' }]];
    const atlas = {
      gardenerMentor: [{ id: 'gardener' }],
      marketKeeper: [{ id: 'market' }],
      kitchenChef: kitchenChefFrames,
      ambientNPC: { build: () => genericFrames },
    };

    expect(IslandRoomModule.getIslandMentorSprites?.(atlas, 'foodwaste', '#EF9A9A'))
      .toBe(kitchenChefFrames);
  });

  it('uses dedicated Mechanic frames on the circular island', () => {
    const mechanicFrames = [{ id: 'mechanic-idle-a' }, { id: 'mechanic-idle-b' }];
    const genericFrames = [[{ id: 'generic-villager' }]];
    const atlas = {
      gardenerMentor: [{ id: 'gardener' }],
      marketKeeper: [{ id: 'market' }],
      kitchenChef: [{ id: 'chef' }],
      mechanicMentor: mechanicFrames,
      ambientNPC: { build: () => genericFrames },
    };

    expect(IslandRoomModule.getIslandMentorSprites?.(atlas, 'circular', '#80DEEA'))
      .toBe(mechanicFrames);
    expect(
      IslandRoomModule.isDedicatedMentorSprite?.(atlas, 'circular', mechanicFrames),
    ).toBe(true);
  });
});

describe('dedicated island mentor sprite geometry', () => {
  it('centres the 36px Gardener on her tile and keeps her feet anchored', () => {
    const layout = IslandRoomRenderer.getIslandMentorSpriteLayout?.({
      mentor: { col: 4, row: 10 },
      time: 0,
      dedicated: true,
    });

    expect(IslandRoomRenderer.getIslandMentorSpriteLayout).toBeTypeOf('function');
    expect(layout).toEqual({ x: 446, y: 428, width: 36, height: 36 });
    expect(layout?.x + layout?.width / 2).toBe(464);
    expect(layout?.y + layout?.height).toBe(464);
  });
});

describe('dedicated Gardener overlay geometry', () => {
  const getLayout = (overrides = {}) =>
    IslandRoomRenderer.getIslandMentorOverlayLayout?.({
      cx: 464,
      dy: 432,
      spriteTopY: 428,
      nameWidth: 96,
      playerRect: null,
      inviteVisible: false,
      dialogOpen: false,
      dedicated: true,
      ...overrides,
    });

  it('hides the name while the dedicated Gardener invite is visible', () => {
    const layout = getLayout({ inviteVisible: true });

    expect(IslandRoomRenderer.getIslandMentorOverlayLayout).toBeTypeOf('function');
    expect(layout?.showInvite).toBe(true);
    expect(layout?.showName).toBe(false);
  });

  it('hides the name when the adjacent player overlaps its pill', () => {
    const layout = getLayout({
      playerRect: { x: 448, y: 464, width: 32, height: 32 },
    });

    expect(layout?.name).toEqual({ x: 416, y: 466, width: 96, height: 14 });
    expect(layout?.showName).toBe(false);
  });

  it('shows the name when no invite, dialog, or player overlap competes with it', () => {
    const layout = getLayout({
      playerRect: { x: 528, y: 432, width: 32, height: 32 },
    });

    expect(layout?.showInvite).toBe(false);
    expect(layout?.showName).toBe(true);
  });

  it('anchors the pixel invite above the 36px Gardener sprite', () => {
    const layout = getLayout({ inviteVisible: true });

    expect(layout?.invite).toEqual({
      body: { x: 455, y: 409, width: 18, height: 12 },
      tailTip: { x: 464, y: 425 },
    });
  });
});
