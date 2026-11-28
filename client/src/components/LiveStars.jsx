import React, { useEffect, useRef } from 'react';

// Inline keyframes string — injected once by consumers that need the pop/loss
// animations. The gain animation is still set inline (unchanged, so a first
// paint with no known previous value keeps behaving exactly as before); the
// loss animation is CSS-class-only (see .pf-live-star--loss below) precisely
// so the reduced-motion override here can neutralize it with a normal
// (non-!important) rule instead of having to out-specificity an inline style.
export const LIVE_STARS_KEYFRAMES = `
@keyframes scorebarStarPop {
  0% { transform: scale(0.4) rotate(-18deg); }
  60% { transform: scale(1.25) rotate(6deg); }
  100% { transform: scale(1) rotate(0); }
}
@keyframes scorebarStarLoss {
  0% { transform: scale(1) rotate(0); opacity: 1; }
  35% { transform: scale(1.15) rotate(-8deg); opacity: 1; }
  100% { transform: scale(0.85) rotate(6deg); opacity: 0.55; }
}
.pf-live-star--loss {
  animation: scorebarStarLoss 0.5s ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .pf-live-star--loss {
    animation: none;
  }
}
`;

const STAR_GOLD = '#FFD54F';               // reward gold
const STAR_DIM = 'rgba(255,248,225,0.28)'; // unlit outline star

// Pure — no React involved, so it is honestly unit-testable on its own.
// Compares whether star `index` was lit before (`prevStars`) and after
// (`nextStars`) a change. A missing/non-numeric `prevStars` (no known prior
// render, e.g. first paint) is treated as "no transition" so a game can never
// show a false pop or a false loss before it has a real previous value.
export function starTransition(prevStars, nextStars, index) {
  if (typeof prevStars !== 'number') return 'none';
  const wasLit = index < prevStars;
  const isLit = index < nextStars;
  if (isLit && !wasLit) return 'gain';
  if (wasLit && !isLit) return 'loss';
  return 'none';
}

/**
 * LiveStars — shared 3-glyph star row used by ScoreBar (WhereDoesItGrow) and
 * GardenPlanner. `stars` prop is 0-3; lit stars pop on the newest gain, and a
 * star that just turned off (e.g. SeasonMatcher's descending model) plays a
 * real loss animation instead of silently disappearing.
 * Consumers are responsible for injecting LIVE_STARS_KEYFRAMES if they want
 * the animations (ScoreBar already does this via its own <style> tag).
 */
export default function LiveStars({ stars }) {
  // Tracks the stars value from the previous commit so a re-render can tell
  // gain from loss. Effects don't run during SSR/static rendering, so a
  // single-pass render always sees prevStars === undefined → 'none', which
  // starTransition() already treats safely (no false pop, no false loss).
  const prevStarsRef = useRef(undefined);
  const prevStars = prevStarsRef.current;
  useEffect(() => {
    prevStarsRef.current = stars;
  });

  if (typeof stars !== 'number') return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} aria-label={`${stars} out of 3 stars`}>
      {[0, 1, 2].map((i) => {
        const lit = i < stars;
        // Preserve the original behavior exactly when there is no known
        // previous value: the topmost lit star still gets the gain pop on
        // first paint (e.g. a game that mounts already at 3 stars).
        const transition = typeof prevStars === 'number'
          ? starTransition(prevStars, stars, i)
          : (lit && i === stars - 1 ? 'gain' : 'none');
        const className = transition === 'loss' ? 'pf-live-star--loss' : undefined;
        return (
          <span
            key={i}
            className={className}
            style={{
              fontSize: 18,
              lineHeight: 1,
              color: lit ? STAR_GOLD : STAR_DIM,
              textShadow: lit ? '0 1px 2px rgba(120,80,10,0.45)' : 'none',
              display: 'inline-block',
              // Gain keeps the original inline animation untouched (no change
              // for the many games where stars only ever increase). Loss is
              // CSS-class-only (see .pf-live-star--loss) so the reduced-motion
              // rule for it can win without needing an inline `!important`.
              ...(transition === 'gain'
                ? { animation: 'scorebarStarPop 0.45s cubic-bezier(.34,1.56,.64,1)' }
                : null),
            }}
          >
            {lit ? '★' : '☆'}
          </span>
        );
      })}
    </span>
  );
}
