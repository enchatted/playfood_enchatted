// Regression lock for the in-play source pills (the "runtime-check Press-S"
// lesson, applied as a unit test): the choice-overlay and fact-toast source
// pills store hit-rects that MUST satisfy hitTest()'s contract. A {x,y,w,h}
// rect (instead of {x,y,width,height}) makes hitTest compare against NaN and
// the pill silently stops being clickable on mouse/touch — caught here.
import { describe, it, expect } from 'vitest';
import { renderChoiceOverlay, renderMarketFactToast, renderMentor } from './marketTripRenderer.js';
import * as marketTripRenderer from './marketTripRenderer.js';
import { GAME_ROOMS } from './gameRoomData.js';
import { OX, OY } from './gameRoomRenderer.js';
import { hitTest } from '../../utils/canvas.js';
import { MARKET_FACTS } from '../../data/marketTripData.js';

// Minimal 2D-context stub: every method is a no-op except the few that must
// return a value (measureText, gradients). Property assignments are accepted.
function stubCtx() {
  const grad = { addColorStop() {} };
  const target = { __texts: [] };
  return new Proxy(target, {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 60 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (prop === 'fillText') {
        return (text, x, y) => target.__texts.push({ text: String(text), x, y });
      }
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, val) { target[prop] = val; return true; },
  });
}

const STRINGS = {
  local: 'Local', imported: 'Imported', foodMiles: 'fm', chooseHint: 'hint',
  projectedTotals: 'After this choice', money: 'Money', transportPoints: 'Transport', pressS: 'Press S',
  factQuotes: { localDef: 'translated definition' },
};

function rectanglesOverlap(a, b) {
  return !(
    a.x + a.width <= b.x || b.x + b.width <= a.x
    || a.y + a.height <= b.y || b.y + b.height <= a.y
  );
}

describe('Market Trip booth geometry follows its collision footprint', () => {
  const tileSize = 32;

  for (const orientation of ['down', 'up']) {
    it(`keeps the ${orientation}-facing booth art inside its declared solid tiles`, () => {
      const stall = GAME_ROOMS.MarketTrip.stallPositions.find((item) => item.orientation === orientation);
      const geometry = marketTripRenderer.getMarketStallGeometry?.(stall);
      const cols = stall.collisionTiles.map((tile) => tile.col);
      const rows = stall.collisionTiles.map((tile) => tile.row);
      const footprint = {
        left: OX + Math.min(...cols) * tileSize,
        right: OX + (Math.max(...cols) + 1) * tileSize,
        top: OY + Math.min(...rows) * tileSize,
        bottom: OY + (Math.max(...rows) + 1) * tileSize,
      };

      expect(geometry, 'renderer exposes booth geometry').toBeTruthy();
      expect(geometry.left).toBeGreaterThanOrEqual(footprint.left);
      expect(geometry.right).toBeLessThanOrEqual(footprint.right);
      expect(geometry.top).toBeGreaterThanOrEqual(footprint.top);
      expect(geometry.bottom).toBeLessThanOrEqual(footprint.bottom);
      expect(geometry.productY).toBeGreaterThanOrEqual(geometry.top);
      expect(geometry.productY).toBeLessThanOrEqual(geometry.bottom);
      expect(Math.abs(geometry.productX - geometry.centerX)).toBeGreaterThanOrEqual(18);
      expect(geometry.canopyY).toBe(geometry.top);
      expect(geometry.canopyY).toBeLessThan(geometry.vendorY);
      expect(geometry.counterY).toBeGreaterThan(geometry.vendorY);
      expect(geometry.productY).toBeGreaterThan(geometry.vendorY);
      expect(geometry.vendorDir).toBe(orientation === 'up' ? 1 : 0);
    });
  }
});

describe('Market Trip child-friendly market square', () => {
  it('keeps the decorative promenade inside the open central street', () => {
    const promenade = marketTripRenderer.getMarketPromenadeGeometry?.();
    expect(promenade).toEqual({
      x: OX + 32,
      y: OY + 5 * 32,
      width: 18 * 32,
      height: 5 * 32,
    });
  });
});

describe('Market Trip mentor bubble geometry', () => {
  it('keeps the mentor bubble outside every market booth', () => {
    const ctx = stubCtx();
    const state = {
      mentorPos: GAME_ROOMS.MarketTrip.mentorPos,
      mentor: { msg: 'Compare both choices and keep both limits in view.' },
      strings: { mentorName: 'The Grocer' },
    };

    renderMentor(ctx, state);
    expect(state.mentorBubbleRect).toBeTruthy();

    for (const stall of GAME_ROOMS.MarketTrip.stallPositions) {
      const booth = marketTripRenderer.getMarketStallGeometry(stall);
      const boothRect = {
        x: booth.left,
        y: booth.top,
        width: booth.right - booth.left,
        height: booth.bottom - booth.top,
      };
      expect(rectanglesOverlap(state.mentorBubbleRect, boothRect)).toBe(false);
    }
  });
});

describe('in-play source pills are clickable (rect shape matches hitTest)', () => {
  it('choice-overlay source pill is hit-testable at its centre', () => {
    const ctx = stubCtx();
    const state = {
      showingChoice: true, choiceIndex: 0, warning: null, strings: STRINGS,
      moneySpent: 3, milesUsed: 2,
      activeStall: {
        emoji: '🍅', name: 'Tomatoes',
        local: { name: 'Local farm', km: 15, miles: 1, price: 2.5 },
        imported: { name: 'Morocco', km: 2500, miles: 8, price: 1.0, flag: '🇲🇦' },
      },
    };
    renderChoiceOverlay(ctx, state);
    const r = state.choiceSourceRect;
    expect(r, 'choiceSourceRect set').toBeTruthy();
    expect(r.width, 'width key present').toBeGreaterThan(0);
    expect(r.height, 'height key present').toBeGreaterThan(0);
    expect(hitTest({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, r)).toBe(true);
  });

  it('publishes non-overlapping, hit-testable local and imported cards with projected totals', () => {
    const ctx = stubCtx();
    const state = {
      showingChoice: true, choiceIndex: 0, warning: null, strings: STRINGS,
      moneySpent: 3, milesUsed: 2,
      activeStall: {
        emoji: '🍅', name: 'Tomatoes',
        local: { name: 'Local farm', km: 15, miles: 1, price: 2.5 },
        imported: { name: 'Morocco', km: 2500, miles: 8, price: 1.0, flag: '🇲🇦' },
      },
    };

    renderChoiceOverlay(ctx, state);

    expect(hitTest({
      x: state.localChoiceRect.x + state.localChoiceRect.width / 2,
      y: state.localChoiceRect.y + state.localChoiceRect.height / 2,
    }, state.localChoiceRect)).toBe(true);
    expect(hitTest({
      x: state.importedChoiceRect.x + state.importedChoiceRect.width / 2,
      y: state.importedChoiceRect.y + state.importedChoiceRect.height / 2,
    }, state.importedChoiceRect)).toBe(true);
    expect(rectanglesOverlap(state.localChoiceRect, state.importedChoiceRect)).toBe(false);
    expect(rectanglesOverlap(state.localChoiceRect, state.choiceSourceRect)).toBe(false);
    expect(rectanglesOverlap(state.importedChoiceRect, state.choiceSourceRect)).toBe(false);
    // Keep the season badge and explanation inside the market card at the smallest viewport.
    expect(state.choicePanelRect.height).toBeLessThanOrEqual(560);
    expect(state.selectedChoiceLabelRect.width).toBeLessThanOrEqual(140);
    expect(rectanglesOverlap(state.selectedChoiceLabelRect, state.selectedChoiceRect)).toBe(true);
    expect(state.choiceProjection).toEqual({
      local: { money: 5.5, miles: 3 },
      imported: { money: 4, miles: 10 },
    });
  });

  it('renders a focused choice with one shared projection instead of repeated teaching copy', () => {
    const ctx = stubCtx();
    const state = {
      showingChoice: true, choiceIndex: 1, warning: null,
      strings: {
        ...STRINGS,
        choiceQuestion: 'Which one goes in your basket?',
        moneyExplanation: 'MONEY EXPLANATION SHOULD STAY IN THE INTRO',
        transportExplanation: 'TRANSPORT EXPLANATION SHOULD STAY IN THE INTRO',
      },
      moneySpent: 3, milesUsed: 2,
      activeStall: {
        emoji: '🍊', name: 'Oranges',
        local: { name: 'Local orchard', km: 20, miles: 1, price: 2.2 },
        imported: { name: 'South Africa', km: 9500, miles: 9, price: 0.9, flag: '🇿🇦' },
      },
    };

    renderChoiceOverlay(ctx, state);

    const visibleTexts = ctx.__texts.map(({ text }) => text);
    expect(visibleTexts).toContain('Which one goes in your basket?');
    expect(visibleTexts).not.toContain('MONEY EXPLANATION SHOULD STAY IN THE INTRO');
    expect(visibleTexts).not.toContain('TRANSPORT EXPLANATION SHOULD STAY IN THE INTRO');
    expect(visibleTexts.filter((text) => text === 'After this choice')).toHaveLength(1);
    expect(state.choiceSummaryRect).toBeTruthy();
    expect(rectanglesOverlap(state.choiceSummaryRect, state.localChoiceRect)).toBe(false);
    expect(rectanglesOverlap(state.choiceSummaryRect, state.importedChoiceRect)).toBe(false);
  });

  it('opens with no card selected and asks the child to pick one', () => {
    const ctx = stubCtx();
    const state = {
      showingChoice: true, choiceIndex: -1, warning: null,
      strings: { ...STRINGS, pickPrompt: 'Pick one card' },
      moneySpent: 0, milesUsed: 0, budget: 15.5,
      activeStall: {
        emoji: '🍅', name: 'Tomatoes',
        local: { name: 'Local farm', km: 15, miles: 1, price: 1, inSeason: true },
        imported: { name: 'Morocco', km: 2500, miles: 8, price: 1.5, flag: '🇲🇦' },
      },
    };
    renderChoiceOverlay(ctx, state);
    expect(state.selectedChoiceRect).toBeNull();
    expect(state.selectedChoiceLabelRect).toBeNull();
    expect(ctx.__texts.map(({ text }) => text)).toContain('👉 Pick one card');
  });

  it('shows the season badge and the matching «why» line on each card', () => {
    const strings = {
      ...STRINGS,
      badgeInSeason: 'IN SEASON', badgeOutOfSeason: 'OUT OF SEASON', badgeImported: 'ALL YEAR',
      whyLocalInSeason: 'Fresh and from nearby.', whyLocalOutOfSeason: 'Costs more now.',
      whyImported: 'Variety all year.', whyImportedFragile: 'Often flies.',
    };
    const render = (inSeason, fragile = false) => {
      const ctx = stubCtx();
      renderChoiceOverlay(ctx, {
        showingChoice: true, choiceIndex: 0, warning: null, strings, moneySpent: 0, milesUsed: 0,
        activeStall: {
          emoji: '🍓', name: 'Strawberries', fragile,
          local: { name: 'Local field', km: 10, miles: 1, price: inSeason ? 2.5 : 4, inSeason },
          imported: { name: 'Egypt', km: 3200, miles: 8, price: 2, flag: '🇪🇬' },
        },
      });
      return ctx.__texts.map(({ text }) => text);
    };
    const inSeason = render(true, true);
    expect(inSeason).toContain('🟢 IN SEASON');
    expect(inSeason).toContain('Fresh and from nearby.');
    expect(inSeason).toContain('Variety all year.');
    const outOfSeason = render(false, true);
    expect(outOfSeason).toContain('🟠 OUT OF SEASON');
    expect(outOfSeason).toContain('Costs more now.');
    // EUFIC: fragile OUT-OF-SEASON soft fruit is often flown in.
    expect(outOfSeason).toContain('Often flies.');
  });

  it('greys out a local option that has no local season in this country', () => {
    const ctx = stubCtx();
    renderChoiceOverlay(ctx, {
      showingChoice: true, choiceIndex: 1, warning: null,
      strings: { ...STRINGS, badgeNoLocal: 'NO LOCAL SEASON', whyNoLocal: 'Only imported here.' },
      moneySpent: 0, milesUsed: 0,
      activeStall: {
        emoji: '🍊', name: 'Oranges',
        local: { name: 'Local grove', km: 20, miles: 1, price: 3, inSeason: false, available: false },
        imported: { name: 'South Africa', km: 9500, miles: 9, price: 1.5, flag: '🇿🇦' },
      },
    });
    const texts = ctx.__texts.map(({ text }) => text);
    expect(texts).toContain('⚪ NO LOCAL SEASON');
    expect(texts).toContain('Only imported here.');
    expect(texts.some((text) => text.includes('€3.00'))).toBe(false);
  });

  it('fact-toast source chip is hit-testable at its centre', () => {
    const ctx = stubCtx();
    const state = {
      strings: STRINGS, factTimer: 5,
      factToast: { quote: 'translated quote', sourceKey: MARKET_FACTS.localFirst.sourceKey },
    };
    renderMarketFactToast(ctx, state);
    const r = state.factSourceRect;
    expect(r, 'factSourceRect set').toBeTruthy();
    expect(r.width, 'width key present').toBeGreaterThan(0);
    expect(r.height, 'height key present').toBeGreaterThan(0);
    expect(hitTest({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, r)).toBe(true);
  });
});
