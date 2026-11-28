// Pure helper for the MissionIntroCard source chip / "S" key.
// Returns the sourceId the intro should open, or null when no fact is on screen.
// Kept pure (no DOM) so the open path is unit-lockable, and returns null for
// factless games (roll-out: MealPlanner / SeasonMatcher) so a
// chip/S press there is a safe no-op.
export function missionIntroSourceId(state) {
  if (state && state.showMissionIntro && state.missionIntro && state.missionIntro.introFact) {
    return state.missionIntro.introFact.sourceId;
  }
  return null;
}

// The OPTIONAL second source on the intro card (the «R» key / its chip), used only where a
// game passes `preFact` (Compost Creator prevention/reuse, 01/10). Null everywhere else, so
// R is a safe no-op in the other games.
export function missionIntroPreSourceId(state) {
  if (state && state.showMissionIntro && state.missionIntro && state.missionIntro.preFact) {
    return state.missionIntro.preFact.sourceId;
  }
  return null;
}

// Padded touch target for an intro source chip: the drawn pill is 18 px tall (about 10 px on a
// phone), so the tap area adds 10 px on every side. Only a two-chip card uses it.
export function padIntroChip(r) {
  return { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20 };
}

// Which source a keyboard shortcut should open, or null (review 01/10). Pure, so the
// negative cases are unit-locked rather than living only in a listener:
//   • never with Ctrl / Cmd / Alt (Ctrl/Cmd+R is a page reload, Ctrl/Cmd+S a save), nor on repeat;
//   • never while the game is paused or the quit dialog is open (the card sits behind them);
//   • R → the intro's optional second source (prevention/reuse), only while the intro shows;
//   • S → the intro's source while it shows, otherwise an open fact card's source.
// e.code covers the Greek layout, where the same keys send 'ρ' / 'σ'.
export function sourceShortcutTarget(e, state, { paused = false } = {}) {
  if (!e || !state || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (paused || state.exitConfirmOpen) return null;
  if (e.key === 'r' || e.key === 'R' || e.code === 'KeyR') return missionIntroPreSourceId(state);
  if (e.key === 's' || e.key === 'S' || e.code === 'KeyS') {
    return missionIntroSourceId(state) || state.factCard?.sourceId || null;
  }
  return null;
}
