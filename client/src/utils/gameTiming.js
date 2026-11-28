const IDLE_MS = 5 * 60 * 1000;
const CATEGORIES = ['active', 'learning', 'paused', 'hidden', 'idle', 'other'];

export function gameTimingPhase(game, gameState, state) {
  if (!state) return 'other';
  if (gameState === 'PAUSED' || state.exitConfirmOpen) return 'paused';
  if (gameState !== 'PLAYING') return 'other';
  if (state.showMissionIntro || state.reveal || state.factCard || state.helperTip
    || state.diagnosisCard || state.decisionEvent || state.inspect || state.choice
    || state.showingChoice || state.checkoutOpen || state.factTimer > 0
    || (game === 'FridgeManager' && state.feedback?.timer > 0)
    || (game === 'GardenPlanner' && state.runLost) // run-lost card
    || (game === 'MealPlanner' && state.phase === 'results')) return 'learning';
  if (state.irisOpenness < 1 || state.celebrating || state.pendingRevealTimer > 0) return 'other';
  return 'active';
}

// Integrate elapsed intervals, not RAF dt (which games cap to protect physics).
// Phase transitions are sampled at most 250ms apart while the page is running.
export function createGameTiming({ now = Date.now, phase }) {
  const totals = Object.fromEntries(CATEGORIES.map(key => [key, 0]));
  let last = now(), lastInput = last, previous = phase();
  const sample = () => {
    const end = Math.max(last, now());
    const category = CATEGORIES.includes(previous) ? previous : 'other';
    if (category === 'active' || category === 'learning') {
      const engagedEnd = Math.max(last, Math.min(end, lastInput + IDLE_MS));
      totals[category] += engagedEnd - last;
      totals.idle += end - engagedEnd;
    } else totals[category] += end - last;
    last = end;
    previous = phase();
  };
  return {
    sample,
    activity() { sample(); lastInput = last; },
    snapshot() {
      sample();
      return { timing_version: 1, ...Object.fromEntries(CATEGORIES.map(key => [`${key}_s`, Math.floor(totals[key] / 1000)])) };
    },
  };
}

export function watchGameTiming(source, { target = window, doc = document, now = Date.now } = {}) {
  let suspended = false;
  const phase = () => suspended || doc.hidden || !doc.hasFocus() ? 'hidden'
    : source.current?.timingPhase ?? 'other';
  const clock = createGameTiming({ now, phase });
  const activity = () => clock.activity();
  const sample = () => clock.sample();
  const hide = () => { clock.sample(); suspended = true; clock.sample(); };
  const show = () => { clock.sample(); suspended = false; clock.sample(); };
  const inputs = ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchend', 'wheel'];
  for (const event of inputs) target.addEventListener(event, activity, { capture: true, passive: true });
  for (const event of ['blur', 'focus']) target.addEventListener(event, sample);
  doc.addEventListener('visibilitychange', sample);
  target.addEventListener('pagehide', hide);
  target.addEventListener('pageshow', show);
  const timer = setInterval(sample, 250);
  let result = null;
  return {
    finish() {
      if (result) return result;
      result = clock.snapshot();
      clearInterval(timer);
      for (const event of inputs) target.removeEventListener(event, activity, true);
      for (const event of ['blur', 'focus']) target.removeEventListener(event, sample);
      doc.removeEventListener('visibilitychange', sample);
      target.removeEventListener('pagehide', hide);
      target.removeEventListener('pageshow', show);
      return result;
    },
  };
}
