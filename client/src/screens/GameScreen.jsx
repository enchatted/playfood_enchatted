import React from 'react';
import useGameStore from '../store/gameStore.js';
import { track, beginGameAttempt } from '../utils/analytics.js';
import { GameProgressContext, watchGameAbandonment } from '../utils/gameProgress.js';
import { watchGameTiming } from '../utils/gameTiming.js';
import { resolveGardenRoundSeed } from '../data/gardenData.js';

// The twelve games reachable from the four-island mission map.
import FridgeManager from '../games/foodwaste/FridgeManager.jsx';
import MealPlanner from '../games/foodwaste/MealPlanner.jsx';
import LeftoverChef from '../games/foodwaste/LeftoverChef.jsx';
import SeasonMatcher from '../games/local/SeasonMatcher.jsx';
import MarketTrip from '../games/local/MarketTrip.jsx';
import GardenPlanner from '../games/growing/GardenPlanner.jsx';
import CompostCreator from '../games/circular/CompostCreator.jsx';
import WhereDoesItGrow from '../games/growing/WhereDoesItGrow.jsx';
import SoilDoctor from '../games/growing/SoilDoctor.jsx';
import SpotTheFake from '../games/local/SpotTheFake.jsx';
import CircularCity from '../games/circular/CircularCity.jsx';
import PlanetaryBoundaries from '../games/circular/PlanetaryBoundaries.jsx';

const GAME_COMPONENTS = {
  FridgeManager,
  MealPlanner,
  LeftoverChef,
  SeasonMatcher,
  MarketTrip,
  GardenPlanner,
  CompostCreator,
  WhereDoesItGrow,
  SoilDoctor,
  SpotTheFake,
  CircularCity,
  PlanetaryBoundaries,
};

const TIER_STARS = {
  perfect: 3,
  excellent: 2,
  great: 2,
  pass: 1,
};

export function resolveCompletionStars({ passed, stars, tier }) {
  if (!passed) return 0;
  if (Number.isFinite(stars)) {
    return Math.max(0, Math.min(3, Math.trunc(stars)));
  }
  return TIER_STARS[tier] ?? 0;
}

export function createCompletionHandler({
  island,
  mission,
  missionId,
  activeRoundSeed,
  startedAtRef,
  finishedRef,
  attemptIdRef,
  timingRef,
  addCompletedMission,
  addPoints,
  recordStars,
  onNavigate,
}) {
  return (score, passed, extras = {}) => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    const stars = resolveCompletionStars({ passed, ...extras });
    track('game_finish', {
      ...timingRef?.current?.finish(),
      attempt_id: attemptIdRef.current,
      passed: Boolean(passed),
      island,
      game: mission,
      score: Math.round(score),
      stars,
      duration_s: Math.round((Date.now() - startedAtRef.current) / 1000),
    });

    if (passed) {
      addCompletedMission(island, missionId);
    }
    recordStars(`${island}:${mission}`, stars);
    // Clamp at 0 so a game that scores honestly negative (only
    // SoilDoctor opts into allowNegativeScore) can't bleed a negative run-score
    // into the global points total. The in-game "red budget" stays untouched.
    addPoints(Math.max(0, score));
    // Spec 2026-05-19: games can pass arbitrary extras (e.g. healthyHarvests,
    // wrongToolCount) for the ResultScreen to use. GardenPlanner's roundSeed is
    // written after extras so Retry always receives the round that was played.
    onNavigate('result', {
      island,
      mission,
      missionId,
      score,
      passed,
      ...extras,
      stars,
      ...(activeRoundSeed !== null ? { roundSeed: activeRoundSeed } : {}),
    });
  };
}

export default function GameScreen({ island, mission, missionId, roundSeed, onNavigate }) {
  const addCompletedMission = useGameStore((s) => s.addCompletedMission);
  const addPoints = useGameStore((s) => s.addPoints);
  const recordStars = useGameStore((s) => s.recordStars);

  const GameComponent = GAME_COMPONENTS[mission];
  const activeRoundSeed = React.useMemo(
    () => resolveGardenRoundSeed(mission, roundSeed),
    [mission, roundSeed],
  );

  // Ένα σημείο δίνει τρία events: έναρξη στο mount, ολοκλήρωση στο handleComplete,
  // εγκατάλειψη στο unmount χωρίς ολοκλήρωση.
  const startedAtRef = React.useRef(Date.now());
  const finishedRef = React.useRef(false);
  const attemptIdRef = React.useRef(null);
  const progressSource = React.useMemo(() => ({ current: null, mission }), [island, mission]);
  const timingRef = React.useRef(null);

  React.useEffect(() => {
    startedAtRef.current = Date.now();
    finishedRef.current = false;
    attemptIdRef.current = beginGameAttempt({ island, game: mission });
    timingRef.current = watchGameTiming(progressSource);
    const timing = timingRef.current;
    const leave = watchGameAbandonment({
      target: window, mission, island, attemptId: attemptIdRef.current,
      finishedRef, source: progressSource, timing,
    });
    return () => { leave(); timing.finish(); };
  }, [island, mission, progressSource]);

  const handleComplete = React.useMemo(() => createCompletionHandler({
    island,
    mission,
    missionId,
    activeRoundSeed,
    startedAtRef,
    finishedRef,
    attemptIdRef,
    timingRef,
    addCompletedMission,
    addPoints,
    recordStars,
    onNavigate,
  }), [
    island,
    mission,
    missionId,
    activeRoundSeed,
    addCompletedMission,
    addPoints,
    recordStars,
    onNavigate,
  ]);

  if (!GameComponent) {
    return (
      <div style={{ color: '#fff', padding: 40, textAlign: 'center' }}>
        <h2>Game not found: {mission}</h2>
        <button
          onClick={() => onNavigate('hub')}
          style={{ marginTop: 20, padding: '10px 24px', fontSize: 16, cursor: 'pointer' }}
        >
          Back to Map
        </button>
      </div>
    );
  }

  return (
    <GameProgressContext.Provider value={progressSource}>
    <GameComponent
      island={island}
      mission={mission}
      missionId={missionId}
      roundSeed={activeRoundSeed}
      onComplete={handleComplete}
      onNavigate={onNavigate}
    />
    </GameProgressContext.Provider>
  );
}
