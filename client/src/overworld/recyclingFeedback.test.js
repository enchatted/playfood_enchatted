import { describe, expect, it } from 'vitest';
import * as overworldRenderer from './overworldRenderer.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

const LOCALES = [['en', en], ['el', el], ['nl', nl], ['pt', pt]];

describe('Task 4 recycling feedback', () => {
  it('points to the recycling island from the first collected trash item', () => {
    const shouldRenderArrow = overworldRenderer.shouldRenderRecyclingArrow;
    expect(shouldRenderArrow, 'shouldRenderRecyclingArrow export is missing').toBeDefined();

    expect(shouldRenderArrow({ trashCargo: 0 })).toBe(false);
    expect(shouldRenderArrow({ trashCargo: 1 })).toBe(true);
    expect(shouldRenderArrow({ trashCargo: 2 })).toBe(true);
    expect(shouldRenderArrow({ trashCargo: 3 })).toBe(true);
  });

  it('publishes visibility only after the renderer draws the recycling arrow', () => {
    const context = {
      globalAlpha: 1,
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {},
      fillText() {},
    };
    const farFromDock = {
      trashCargo: 1,
      player: { pixelX: 0, pixelY: 0 },
      camera: { x: 0, y: 0 },
      time: 0,
    };

    overworldRenderer.renderRecyclingArrow(context, farFromDock);
    expect(farFromDock.recyclingArrowVisible).toBe(true);

    const emptyCargo = { ...farFromDock, trashCargo: 0 };
    overworldRenderer.renderRecyclingArrow(context, emptyCargo);
    expect(emptyCargo.recyclingArrowVisible).toBe(false);

    const besideDock = {
      ...farFromDock,
      player: { pixelX: 28 * 32, pixelY: 37 * 32 },
    };
    overworldRenderer.renderRecyclingArrow(context, besideDock);
    expect(besideDock.recyclingArrowVisible).toBe(false);
  });

  it('keeps the real recycled count and awarded points in a longer impact toast', () => {
    const buildReward = overworldRenderer.buildRecyclingRewardToast;
    expect(buildReward, 'buildRecyclingRewardToast export is missing').toBeDefined();

    const reward = buildReward({
      recycleSuccess: (count, points) => `recycled=${count}; points=${points}`,
      recycleImpacts: ['marine-life-impact', 'plastic-impact'],
    }, 3, 15, 1);

    expect(reward).toEqual({
      text: 'recycled=3; points=15',
      detail: 'marine-life-impact',
      variant: 'impact',
      duration: 4.8,
    });

    const state = {};
    overworldRenderer.showToast(state, reward.text, '#2E7D32', reward);
    expect(state.toast).toMatchObject({
      text: 'recycled=3; points=15',
      detail: 'marine-life-impact',
      color: '#2E7D32',
      variant: 'impact',
      duration: 4.8,
      elapsed: 0,
    });
  });

  it('shows every impact message once before starting a differently shuffled cycle', () => {
    const selectImpact = overworldRenderer.selectRecyclingImpact;
    expect(selectImpact, 'selectRecyclingImpact export is missing').toBeDefined();

    const messages = ['turtle', 'plastic', 'injury', 'recycling', 'coasts'];
    const selections = Array.from(
      { length: 10 },
      (_, index) => selectImpact(messages, index + 1),
    );
    const firstCycle = selections.slice(0, 5);
    const secondCycle = selections.slice(5, 10);

    expect(new Set(firstCycle)).toEqual(new Set(messages));
    expect(new Set(secondCycle)).toEqual(new Set(messages));
    expect(secondCycle).not.toEqual(firstCycle);
    expect(secondCycle[0]).not.toBe(firstCycle[4]);
  });

  it('renders both the recycling result and the environmental consequence', () => {
    const renderedText = [];
    const context = {
      beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
      fill() {}, stroke() {}, fillRect() {}, strokeRect() {},
      measureText: (text) => ({ width: String(text).length * 8 }),
      fillText: (text) => renderedText.push(text),
      globalAlpha: 1,
    };
    const state = {
      toast: {
        text: '♻️ Recycled 3 pieces! +15 points',
        detail: '🐢 A cleaner sea is safer for marine life.',
        color: '#2E7D32',
        variant: 'impact',
        elapsed: 1,
        duration: 4.8,
      },
    };

    overworldRenderer.renderToast(context, state);

    expect(renderedText).toContain('♻️ Recycled 3 pieces! +15 points');
    expect(renderedText).toContain('🐢 A cleaner sea is safer for marine life.');
  });

  it('hides the empty-dock prompt while the impact reward is being read', () => {
    const shouldRenderPrompt = overworldRenderer.shouldRenderRecyclingPrompt;
    expect(shouldRenderPrompt, 'shouldRenderRecyclingPrompt export is missing').toBeDefined();

    expect(shouldRenderPrompt({ nearRecyclingDock: true, toast: null })).toBe(true);
    expect(shouldRenderPrompt({
      nearRecyclingDock: true,
      toast: { variant: 'impact' },
    })).toBe(false);
  });

  it('has singular, plural and five distinct environmental messages in all four languages', () => {
    for (const [language, locale] of LOCALES) {
      const { hub } = locale;
      expect(hub.recycle_success_one, `${language} singular`).toContain('{{count}}');
      expect(hub.recycle_success_one, `${language} singular points`).toContain('{{points}}');
      expect(hub.recycle_success_other, `${language} plural`).toContain('{{count}}');
      expect(hub.recycle_success_other, `${language} plural points`).toContain('{{points}}');
      expect(hub.recycle_impacts, `${language} impacts`).toHaveLength(5);
      expect(new Set(hub.recycle_impacts).size, `${language} distinct impacts`).toBe(5);
      expect(hub.recycle_impacts.every(Boolean), `${language} non-empty impacts`).toBe(true);
    }
  });
});
