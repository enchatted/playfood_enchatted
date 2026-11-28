// Locks for the «Λαϊκή Αγορά» island room (Island 1 pattern, 1:1).
// Written AFTER the blind thumbnail test passed (rule: blind tests before locks).
import { describe, it, expect } from 'vitest';
import {
  ROOMS,
  isMissionUnlocked,
  isRoomWalkable,
  nextMissionId,
} from './islandRoomData.js';
import * as IslandRoomData from './islandRoomData.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';
import { getLocalAwningLift, getLocalStallLayout } from './islandRoomRenderer.js';

const room = ROOMS.local;
const LOCALES = [['en', en], ['el', el], ['nl', nl], ['pt', pt]];

describe('room structure mirrors the growing pattern', () => {
  it('Z-layout: Hook top-left → Practice top-right → Challenge bottom-right', () => {
    expect(room.npcs[0]).toMatchObject({ col: 4, row: 3, missionIdx: 0 });
    expect(room.npcs[1]).toMatchObject({ col: 15, row: 3, missionIdx: 1 });
    expect(room.npcs[2]).toMatchObject({ col: 15, row: 10, missionIdx: 2 });
  });

  it('keeps the approved 2.1 → 2.2 → 2.3 progression contract', () => {
    const progressStates = [
      { completed: [], unlocked: [true, false, false], next: 1 },
      { completed: [1], unlocked: [true, true, false], next: 2 },
      { completed: [1, 2], unlocked: [true, true, true], next: 3 },
      { completed: [1, 2, 3], unlocked: [true, true, true], next: undefined },
    ];

    for (const state of progressStates) {
      expect([1, 2, 3].map((id) => isMissionUnlocked('local', id, state.completed)))
        .toEqual(state.unlocked);
      expect(nextMissionId('local', state.completed)).toBe(state.next);
    }
  });

  it('keeps ambient routes away from actor and interaction tiles', () => {
    const reserved = new Set();
    for (const actor of [...room.npcs, room.mentor]) {
      reserved.add(`${actor.col},${actor.row}`);
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        reserved.add(`${actor.col + dc},${actor.row + dr}`);
      }
    }

    for (const [shopperIndex, shopper] of room.ambientNPCs.entries()) {
      for (const waypoint of shopper.waypoints) {
        expect(
          reserved.has(`${waypoint.col},${waypoint.row}`),
          `shopper ${shopperIndex + 1} waypoint ${waypoint.col},${waypoint.row}`,
        ).toBe(false);
      }
    }
  });

  it('mentor (Μανάβισσα) sits bottom-left with ceremony + reflection enabled', () => {
    expect(room.mentor).toMatchObject({ col: 4, row: 10 });
    expect(room.ceremony).toBe(true);
    expect(room.ceremonyIcon).toBeTruthy();
    expect(room.reflection).toBe(true);
  });

  it('every corner has vignettes; props are solid but never wall off an NPC', () => {
    expect(room.vignettes.length).toBeGreaterThanOrEqual(10);
    // each vignette tile is solid scenery
    for (const v of room.vignettes) {
      for (let c = v.col; c < v.col + (v.w || 1); c++) {
        expect(isRoomWalkable(room, c, v.row), `vignette ${v.type}@${c},${v.row}`).toBe(false);
      }
    }
    // each NPC and the mentor keep at least one walkable orthogonal neighbor
    const actors = [...room.npcs, room.mentor];
    for (const a of actors) {
      const reachable = [[0, 1], [0, -1], [1, 0], [-1, 0]]
        .some(([dc, dr]) => isRoomWalkable(room, a.col + dc, a.row + dr));
      expect(reachable, `actor @${a.col},${a.row}`).toBe(true);
    }
  });

  it('the 2.3 corner never spoils the STF products (generic props only)', () => {
    // The challenge vignettes must be the abstract set — no type may reference
    // an actual in-game product (yoghurt/choc/soda/oil/oats/bread/cookies).
    const types = room.vignettes.map((v) => v.type);
    expect(types).toContain('magnifierBox');
    for (const spoiler of ['yoghurt', 'choc', 'soda', 'oil', 'oats', 'bread', 'cookies']) {
      expect(types.join(' ')).not.toMatch(new RegExp(spoiler, 'i'));
    }
  });
});

describe('living market presentation', () => {
  it('groups connected furniture into one clear market stall instead of stacked boxes', () => {
    expect(getLocalStallLayout(room, 2, 2)).toEqual({
      draw: true, orientation: 'horizontal', col: 2, row: 2, length: 2,
    });
    expect(getLocalStallLayout(room, 3, 2)).toEqual({
      draw: false, orientation: 'horizontal', col: 2, row: 2, length: 2,
    });
    expect(getLocalStallLayout(room, 7, 6)).toEqual({
      draw: true, orientation: 'vertical', col: 7, row: 6, length: 2,
    });
    expect(getLocalStallLayout(room, 7, 7)).toEqual({
      draw: false, orientation: 'vertical', col: 7, row: 6, length: 2,
    });
  });

  it('gives market awnings a restrained one-pixel flutter', () => {
    expect(getLocalAwningLift).toBeTypeOf('function');
    expect(getLocalAwningLift?.(0, 0)).toBe(-1);
    expect(getLocalAwningLift?.(0.5, 0)).toBe(0);
    expect(Math.abs(getLocalAwningLift?.(0, 0) ?? 99)).toBeLessThanOrEqual(1);
    expect(Math.abs(getLocalAwningLift?.(0.5, 0) ?? 99)).toBeLessThanOrEqual(1);
  });

  it('resolves annotated market stops without changing legacy waypoint timing', () => {
    const resolveStop = IslandRoomData.resolveAmbientWaypointStop;
    expect(resolveStop).toBeTypeOf('function');

    expect(resolveStop?.({
      col: 6,
      row: 4,
      pauseMin: 0.8,
      pauseMax: 1.8,
      face: 'LEFT',
      activity: 'browse-season',
    }, 0.5)).toEqual({
      duration: 1.3,
      face: 2,
      activity: 'browse-season',
    });

    expect(resolveStop?.({ col: 1, row: 5 }, 0.25)).toEqual({
      duration: 0.8,
      face: null,
      activity: null,
    });
  });

  it('gives every shopper at least two purposeful market stops', () => {
    const activities = new Set();

    for (const shopper of room.ambientNPCs) {
      const stops = shopper.waypoints.filter((waypoint) => waypoint.activity);
      expect(stops.length).toBeGreaterThanOrEqual(2);
      for (const stop of stops) {
        expect(stop.pauseMin).toBeGreaterThanOrEqual(0.8);
        expect(stop.pauseMax).toBeLessThanOrEqual(1.8);
        expect(['UP', 'DOWN', 'LEFT', 'RIGHT']).toContain(stop.face);
        activities.add(stop.activity);
      }
    }

    expect(activities).toEqual(new Set([
      'browse-season',
      'browse-local',
      'inspect-label',
      'carry-basket',
    ]));
  });
});

describe('mentor + ceremony i18n (×4 locales)', () => {
  const KEYS = [
    'mentor_name_local', 'mentor_prompt_local', 'intro_local',
    'ceremony_title_local', 'ceremony_msg_local',
  ];
  it('all 5 keys exist, translated, in every locale', () => {
    for (const [lname, loc] of LOCALES) {
      for (const key of KEYS) {
        expect(loc.island?.[key], `${lname} island.${key}`).toBeTruthy();
        expect(loc.island[key], `${lname} island.${key}`).not.toMatch(/_TODO/);
      }
    }
  });

  it('the intro points to just the first mission', () => {
    for (const [lname, loc] of LOCALES) {
      expect(loc.island.intro_local.match(/\{\{m\d\}\}/g), lname).toEqual(['{{m1}}']);
    }
  });
});
