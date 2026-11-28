import { describe, it, expect } from 'vitest';
import { missionIntroSourceId, missionIntroPreSourceId, padIntroChip, sourceShortcutTarget } from './missionIntroLogic.js';

describe('missionIntroSourceId — the source the intro chip / "S" key opens', () => {
  it('returns the introFact sourceId when the card is shown with a fact', () => {
    const state = { showMissionIntro: true, missionIntro: { introFact: { sourceId: 'food-storage-fridge-freezer-cupboard' } } };
    expect(missionIntroSourceId(state)).toBe('food-storage-fridge-freezer-cupboard');
  });

  it('returns null when the card is not shown (no accidental open mid-game)', () => {
    const state = { showMissionIntro: false, missionIntro: { introFact: { sourceId: 'x' } } };
    expect(missionIntroSourceId(state)).toBeNull();
  });

  it('returns null for a factless intro (roll-out games without an approved fact)', () => {
    const state = { showMissionIntro: true, missionIntro: { introFact: null } };
    expect(missionIntroSourceId(state)).toBeNull();
  });

  it('returns null for a missing/empty state', () => {
    expect(missionIntroSourceId(null)).toBeNull();
    expect(missionIntroSourceId({})).toBeNull();
  });
});

describe('missionIntroPreSourceId — the optional second source («R», 01/10)', () => {
  it('returns the preFact sourceId while the card is shown', () => {
    const state = { showMissionIntro: true, missionIntro: { introFact: { sourceId: 'a' }, preFact: { sourceId: 'b' } } };
    expect(missionIntroPreSourceId(state)).toBe('b');
    expect(missionIntroSourceId(state)).toBe('a');
  });
  it('is null for every card without a preFact and when the card is hidden', () => {
    expect(missionIntroPreSourceId({ showMissionIntro: true, missionIntro: { introFact: { sourceId: 'a' } } })).toBeNull();
    expect(missionIntroPreSourceId({ showMissionIntro: true, missionIntro: { introFact: { sourceId: 'a' }, preFact: null } })).toBeNull();
    expect(missionIntroPreSourceId({ showMissionIntro: false, missionIntro: { preFact: { sourceId: 'b' } } })).toBeNull();
    expect(missionIntroPreSourceId(null)).toBeNull();
  });
});

describe('padIntroChip — touch target for the two-chip intro', () => {
  it('adds 10 px on every side of the drawn pill', () => {
    expect(padIntroChip({ x: 100, y: 50, width: 80, height: 18 })).toEqual({ x: 90, y: 40, width: 100, height: 38 });
  });
});

describe('sourceShortcutTarget — R / S never fire behind an overlay or with a modifier (01/10)', () => {
  const intro = { showMissionIntro: true, missionIntro: { introFact: { sourceId: 'composting-home' }, preFact: { sourceId: 'recycle-common-recyclables' } } };
  const key = (k, extra = {}) => ({ key: k, code: `Key${k.toUpperCase()}`, ...extra });

  it('R opens the prevention source and S the definition while the intro shows', () => {
    expect(sourceShortcutTarget(key('r'), intro)).toBe('recycle-common-recyclables');
    expect(sourceShortcutTarget(key('s'), intro)).toBe('composting-home');
    // Greek layout: key is 'ρ' / 'σ', code is still KeyR / KeyS
    expect(sourceShortcutTarget({ key: 'ρ', code: 'KeyR' }, intro)).toBe('recycle-common-recyclables');
    expect(sourceShortcutTarget({ key: 'σ', code: 'KeyS' }, intro)).toBe('composting-home');
  });

  it('nothing while paused or behind the quit dialog', () => {
    expect(sourceShortcutTarget(key('r'), intro, { paused: true })).toBeNull();
    expect(sourceShortcutTarget(key('s'), intro, { paused: true })).toBeNull();
    expect(sourceShortcutTarget(key('r'), { ...intro, exitConfirmOpen: true })).toBeNull();
  });

  it('nothing with Ctrl / Cmd / Alt (reload, save) or on key repeat', () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
      expect(sourceShortcutTarget(key('r', mod), intro)).toBeNull();
      expect(sourceShortcutTarget(key('s', mod), intro)).toBeNull();
    }
  });

  it('R is a no-op without a preFact; S falls back to an open fact card during play', () => {
    const single = { showMissionIntro: true, missionIntro: { introFact: { sourceId: 'a' } } };
    expect(sourceShortcutTarget(key('r'), single)).toBeNull();
    const playing = { showMissionIntro: false, missionIntro: intro.missionIntro, factCard: { sourceId: 'fostplus-drinkcartons' } };
    expect(sourceShortcutTarget(key('s'), playing)).toBe('fostplus-drinkcartons');
    expect(sourceShortcutTarget(key('r'), playing)).toBeNull();
    expect(sourceShortcutTarget(key('x'), intro)).toBeNull();
  });
});
