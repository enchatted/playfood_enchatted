// Reflection prompt wiring locks (Kolb-cycle reflection pilot, island 2).
import { describe, it, expect } from 'vitest';
import { ROOMS, MISSION_MAP } from './islandRoomData.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

const KEYS = [
  'reflection_title_local', 'reflection_q_local',
  'reflection_opt1_local', 'reflection_opt2_local', 'reflection_opt3_local',
  'reflection_ack_local',
];

describe('reflection prompt (island: local)', () => {
  it('the local room opts in via room.reflection', () => {
    expect(ROOMS.local.reflection).toBe(true);
  });

  it('fires between Practice→Challenge: island 2 phases are hook/practice/challenge in order', () => {
    expect(MISSION_MAP.local.map((m) => m.phase)).toEqual(['hook', 'practice', 'challenge']);
  });

  it('all reflection keys exist in all 4 locales', () => {
    for (const [name, loc] of [['en', en], ['el', el], ['nl', nl], ['pt', pt]]) {
      for (const key of KEYS) {
        expect(loc.island?.[key], `${name}: island.${key}`).toBeTruthy();
      }
    }
  });

  it('the question is the Content-Dev verbatim in EN', () => {
    expect(en.island.reflection_q_local).toBe('Why is this available now?');
    // and the ack carries the second Content-Dev question as the take-away
    expect(en.island.reflection_ack_local).toMatch(/where does it come from if it is out of season here\?/);
  });
});
