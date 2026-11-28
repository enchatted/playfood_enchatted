import { hasDrawnIcon } from '../engine/itemGlyphs.js';
import { buildWrongHint, formatMonthRuns } from '../../data/seasonMatcherData.js';

// Checkout reading time per verdict. The rejected branch already had enough
// time to teach; the accepted branch used to be a 1.5s blip with no name, so
// a correct pick barely registered next to a wrong one. Kept clearly shorter
// than the rejected explanation, which needs enough time for a child to read
// the food, the reason and its correct month range.
export function feedbackDurationForVerdict(inSeason) {
  return inSeason ? 2.25 : 4.5;
}

// Immediate pickup feedback for an in-season food — mirrors the existing
// out-of-season pickup toast so both verdicts get a visible reaction at the
// moment of choice, not just at checkout. The only claim made is that the
// food is in season here now (what the shelf already encodes); no origin,
// distance or freshness claim is added.
export function buildInSeasonPickupText(food, t) {
  return t('season.pickup_in_season', { food: t(food.nameKey) });
}

// Checkout confirmation for an accepted food — a Bravo-style affirmation
// plus the food name, symmetric with the out-of-season checkout explanation
// (which already names the food and explains why it was rejected).
export function buildBravoCheckoutText(food, t) {
  return ['✅', hasDrawnIcon(food) ? '' : food.emoji, t('season.bravo_in_season', { food: t(food.nameKey) })]
    .filter(Boolean).join(' ');
}
// Text-only feedback cannot show our canvas/SVG glyph. Keep the accurate name
// and omit the unrelated emoji, without changing the actual food metadata.
export function buildSeasonWrongHint(food, t) {
  const presentation = hasDrawnIcon(food) ? { ...food, emoji: '' } : food;
  return buildWrongHint(presentation, t).trim();
}

export function buildTraveledSummary(foods, t) {
  return foods.slice(0, 4).map((food) => ({
    emoji: hasDrawnIcon(food) ? '' : food.emoji,
    name: t(food.nameKey),
    window: food.inSeasonMonths?.length
      ? formatMonthRuns(food.inSeasonMonths, t)
      : t('season.always_imported'),
  }));
}
