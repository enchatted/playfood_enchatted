import { describe, it, expect } from 'vitest';
import { encodeProgress, decodeProgress, PROGRESS_FIELDS } from './playCode.js';

const SAMPLE = {
  language: 'el',
  heroId: 'pigtails',
  completedMissions: { growing: [1, 2], local: [1], foodwaste: [], circular: [3] },
  points: 450,
  redeemedCodes: ['SAVEIT', 'GROWIT'],
  ceremoniesSeen: ['growing'],
  reflectionsSeen: ['local'],
  whaleSpotted: true,
  recycleTrips: 2,
  totalRecycled: 14,
  lighthouseGoldSeen: ['growing'],
  gameStars: { 'growing:WhereDoesItGrow': 3, 'local:SeasonMatcher': 2 },
  boatTier: 1,
  // transient fields that must NOT travel in the code:
  currentScreen: 'hub',
  navigationData: { x: 1 },
  points_typo: 999,
};

const EMPTY = {
  language: 'en',
  heroId: null,
  completedMissions: { growing: [], local: [], foodwaste: [], circular: [] },
  points: 0,
  redeemedCodes: [],
  ceremoniesSeen: [],
  reflectionsSeen: [],
  whaleSpotted: false,
  recycleTrips: 0,
  totalRecycled: 0,
  lighthouseGoldSeen: [],
  gameStars: {},
  boatTier: 0,
};

const FULL = {
  language: 'pt',
  heroId: 'bob',
  completedMissions: { growing: [1, 2, 3], local: [1, 2, 3], foodwaste: [1, 2, 3], circular: [1, 2, 3] },
  points: 65535,
  redeemedCodes: ['SAVEIT', 'LOCALF', 'SEASON', 'GROWIT', 'COMPOS'],
  ceremoniesSeen: ['growing', 'local', 'foodwaste', 'circular'],
  reflectionsSeen: ['growing', 'local', 'foodwaste', 'circular'],
  whaleSpotted: true,
  recycleTrips: 127,
  totalRecycled: 65535,
  lighthouseGoldSeen: ['growing', 'local', 'foodwaste', 'circular'],
  gameStars: {
    'growing:WhereDoesItGrow': 3, 'growing:GardenPlanner': 1, 'growing:SoilDoctor': 2,
    'local:SeasonMatcher': 3, 'local:MarketTrip': 2, 'local:SpotTheFake': 1,
    'foodwaste:FridgeManager': 3, 'foodwaste:MealPlanner': 2, 'foodwaste:LeftoverChef': 1,
    'circular:CompostCreator': 3, 'circular:CircularCity': 2, 'circular:PlanetaryBoundaries': 1,
  },
  boatTier: 3,
};

const VERSION_2_SAMPLE_CODE = 'fizo-sete-mati-rivo-hali-nima-todo-fise-liwe';
// Captured from the real schema-v3 encoder before introducing schema v4.
// Its 200 trips prove the frozen v3 decoder still reads the original 8-bit field.
const VERSION_3_SAMPLE_CODE = 'kilo-sete-mati-rivo-hasa-sima-zimi-fise-jave';

const fieldsOf = (decoded) => {
  const out = {};
  for (const key of PROGRESS_FIELDS) out[key] = decoded[key];
  return out;
};

describe('playCode word-phrase codec', () => {
  it('preserves new configurable activity IDs without losing legacy redemptions', () => {
    const state = { ...SAMPLE, redeemedCodes: ['SAVEIT', 'SCHOOL_GARDEN_2026', 'LUNCH_DAY'] };
    const code = encodeProgress(state);
    expect(decodeProgress(code).redeemedCodes).toEqual(state.redeemedCodes);
    expect(decodeProgress(code.toUpperCase()).redeemedCodes).toEqual(state.redeemedCodes);
    expect(decodeProgress(code.replace('school_garden', 'school_gardem'))).toBeNull();
  });
  it.each([['sample', SAMPLE], ['empty', EMPTY], ['full', FULL]])(
    'round-trips every persisted progress field (%s state)',
    (_label, state) => {
      const decoded = decodeProgress(encodeProgress(state));
      for (const key of PROGRESS_FIELDS) {
        expect(decoded[key]).toEqual(state[key]);
      }
    },
  );

  it.each([0, 1, 2, 3, 4])('round-trips schema-v4 boat tier %i', (boatTier) => {
    const decoded = decodeProgress(encodeProgress({ ...SAMPLE, boatTier }));
    expect(decoded).toMatchObject({ v: 4, boatTier });
  });

  it('decodes a real schema-v2 code and derives a compatible boat tier', () => {
    const decoded = decodeProgress(VERSION_2_SAMPLE_CODE);
    expect(decoded).toMatchObject({
      v: 2,
      language: 'el',
      heroId: 'pigtails',
      points: 450,
      boatTier: 1,
    });
    expect(decoded.recycleTrips).toBe(2);
    expect(decoded.totalRecycled).toBe(14);
  });

  it('decodes a fixed real schema-v3 code with its frozen 8-bit trips and tier layout', () => {
    const decoded = decodeProgress(VERSION_3_SAMPLE_CODE);
    expect(decoded).toMatchObject({
      v: 3,
      language: 'el',
      heroId: 'pigtails',
      points: 450,
      recycleTrips: 200,
      totalRecycled: 14,
      boatTier: 3,
    });
  });

  it('clamps schema-v4 recycle trips to its 7-bit maximum', () => {
    const decoded = decodeProgress(encodeProgress({ ...EMPTY, recycleTrips: 999 }));
    expect(decoded).toMatchObject({ v: 4, recycleTrips: 127 });
  });

  it('does not carry transient (non-progress) state', () => {
    const decoded = decodeProgress(encodeProgress(SAMPLE));
    expect(decoded.currentScreen).toBeUndefined();
    expect(decoded.navigationData).toBeUndefined();
    expect(decoded.points_typo).toBeUndefined();
  });

  it('produces exactly 9 CVCV words under schema v4', () => {
    const code = encodeProgress(SAMPLE);
    const words = code.split('-');
    expect(words).toHaveLength(9);
    expect(words.every((word) => (
      /^[bdfghjklmnrstvwz][aeio][bdfghjklmnrstvwz][aeio]$/.test(word)
    ))).toBe(true);
    expect(code.length).toBeLessThanOrEqual(50); // vs ~431 for the old blob
  });

  it('clamps absurd points to the field max (documents the cap)', () => {
    const decoded = decodeProgress(encodeProgress({ ...EMPTY, points: 999999 }));
    expect(decoded.points).toBe(65535);
  });

  it('returns null for malformed / foreign input', () => {
    expect(decodeProgress('')).toBeNull();
    expect(decodeProgress(null)).toBeNull();
    expect(decodeProgress(undefined)).toBeNull();
    expect(decodeProgress('blue-fish-472')).toBeNull();            // old server nickname
    expect(decodeProgress('PF1eyJ2IjoxfQ')).toBeNull();            // old base64 blob
    expect(decodeProgress('zzzz-zzzz-zzzz')).toBeNull();           // wrong word count
    const good = encodeProgress(SAMPLE);
    expect(decodeProgress(good.split('-').slice(0, 8).join('-'))).toBeNull(); // truncated
    expect(decodeProgress(good.replace(/^[a-z]{4}/, 'qxqx'))).toBeNull();     // invalid letters (q,x absent)
  });

  it('rejects a valid code with an unknown schema version', () => {
    expect(decodeProgress('welo-sete-mati-rivo-halo-sima-sasi-fise-gamo')).toBeNull();
  });

  it('rejects a corrupted phrase via the checksum (no silent wrong restore)', () => {
    const good = encodeProgress(SAMPLE);
    const words = good.split('-');
    words[0] = words[0] === 'baba' ? 'babe' : 'baba'; // swap to a different valid word
    const decoded = decodeProgress(words.join('-'));
    // Either rejected outright, or at least not silently accepted as the original state.
    expect(decoded === null || JSON.stringify(fieldsOf(decoded)) !== JSON.stringify(fieldsOf(decodeProgress(good)))).toBe(true);
  });

  it('tolerates case and surrounding whitespace from a sloppy paste', () => {
    const code = encodeProgress(SAMPLE);
    expect(decodeProgress(`  ${code.toUpperCase()}\n`)).not.toBeNull();
  });
});
