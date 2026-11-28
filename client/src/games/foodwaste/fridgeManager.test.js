import { describe, it, expect } from 'vitest';
import { GAME_ROOMS, isGameRoomWalkable } from '../engine/gameRoomData.js';
import en from '../../i18n/locales/en.json';
import el from '../../i18n/locales/el.json';
import nl from '../../i18n/locales/nl.json';
import pt from '../../i18n/locales/pt.json';
import { STORAGE_IDS } from '../../data/fridgeData.js';

const ROOM = GAME_ROOMS.FridgeManager;
const LOCALES = { en, el, nl, pt };
const NEIGHBOURS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

const reachable = (col, row) =>
  NEIGHBOURS.some(([dc, dr]) => isGameRoomWalkable(ROOM, col + dc, row + dr));

describe('FridgeManager room — 4-station layout', () => {
  it('has exactly the 4 storage stations, matching fridgeData', () => {
    expect(ROOM.bins.map((b) => b.id)).toEqual(['freezer', 'fridge', 'cupboard', 'compost']);
    for (const bin of ROOM.bins) expect(STORAGE_IDS).toContain(bin.id);
  });

  it('every station has tiles and ≥1 reachable (walkable) neighbour', () => {
    for (const bin of ROOM.bins) {
      expect(bin.tiles.length).toBeGreaterThan(0);
      const ok = bin.tiles.some((tt) => reachable(tt.col, tt.row));
      expect(ok, `station ${bin.id} must be reachable`).toBe(true);
    }
  });

  it('every food counter is reachable', () => {
    for (const c of ROOM.counterPositions) {
      expect(reachable(c.col, c.row), `counter ${c.col},${c.row}`).toBe(true);
    }
  });

  it('groups the 10 foods on one compact, symmetrical preparation island', () => {
    expect(ROOM.preparationIsland).toEqual({ left: 5, right: 14, top: 6, bottom: 9 });
    const rows = Map.groupBy(ROOM.counterPositions, (position) => position.row);
    expect([...rows.keys()]).toEqual([6, 9]);
    expect(rows.get(6).map(({ col }) => col)).toEqual([5, 7, 9, 11, 13]);
    expect(rows.get(9).map(({ col }) => col)).toEqual([5, 7, 9, 11, 13]);
  });

  it('provides a dedicated helper station outside the walking lanes', () => {
    expect(ROOM.helper).toMatchObject({ col: 2, row: 11 });
    expect(isGameRoomWalkable(ROOM, ROOM.helper.col, ROOM.helper.row)).toBe(false);
  });
});

describe('FridgeManager i18n — fridge keys ×4', () => {
  const REQUIRED = [
    'station_freezer', 'station_fridge', 'station_cupboard', 'station_compost',
    'pickup_prompt', 'place_prompt', 'drop_prompt', 'floor_pickup_prompt',
    'affirm', 'compost_nudge', 'compost_correct', 'suboptimal_generic', 'avoid_generic',
    'state_day_old', 'state_thawed', 'press_s', 'active_food',
    'accepted_progress', 'first_try_progress', 'retry_same_food', 'feedback_continue',
    'helper_name', 'preparation_counter',
    'helper_prompt', 'helper_idle', 'helper_holding', 'helper_continue',
  ];

  it('all 4 locales carry the new fridge keys — no PT_TODO / empty', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      for (const k of REQUIRED) {
        const v = json.fridge?.[k];
        expect(v, `${code}.fridge.${k}`).toBeTruthy();
        expect(v).not.toMatch(/PT_TODO/);
      }
    }
  });

  it('dead expiry-mechanic keys are gone in every locale', () => {
    for (const json of Object.values(LOCALES)) {
      for (const dead of ['title', 'expires_soon', 'expires_later', 'days_left_one', 'intro_title', 'throw_prompt']) {
        expect(json.fridge?.[dead]).toBeUndefined();
      }
    }
  });

  it('place_prompt interpolates {{station}} in every locale', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      expect(json.fridge.place_prompt, code).toContain('{{station}}');
    }
  });

  it('names the food in pickup prompts and labels progress explicitly', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      expect(json.fridge.pickup_prompt, code).toContain('{{food}}');
      expect(json.fridge.floor_pickup_prompt, code).toContain('{{food}}');
      expect(json.fridge.active_food, code).toContain('{{food}}');
      expect(json.fridge.progress_label, code).toContain('{{placed}}');
      expect(json.fridge.progress_label, code).toContain('{{total}}');
      expect(json.fridge.accepted_progress, code).toContain('{{accepted}}');
      expect(json.fridge.accepted_progress, code).toContain('{{total}}');
      expect(json.fridge.first_try_progress, code).toContain('{{firstTry}}');
    }
  });

  it('explains source touch access and carries all result tiers', () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      expect(json.fridge.press_s, `${code} touch source hint`).toMatch(/tap|touch|άγγι|tik|toca/i);
      const results = json.fridge.results;
      for (const tier of ['perfect', 'great', 'pass', 'fail']) {
        expect(results?.[`tier_${tier}_title`], `${code} ${tier} title`).toBeTruthy();
        expect(results?.[`tier_${tier}_body`], `${code} ${tier} body`).toBeTruthy();
      }
      expect(results?.summary).toContain('{{correct}}');
      expect(results?.summary).toContain('{{total}}');
      expect(results?.summary).toContain('{{firstTry}}');
    }
  });

  it('the tutorial hint was updated off the old expiry mechanic', () => {
    for (const json of Object.values(LOCALES)) {
      const h = json.hint.fridgemanager;
      expect(h).toBeTruthy();
      expect(h).not.toMatch(/PT_TODO|expiry|expiration|λήξης|houdbaarheidsdatum/i);
    }
  });
});
