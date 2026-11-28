import { createContext } from 'react';
import { track, trackFinal } from './analytics.js';

export const GameProgressContext = createContext(null);

function percent(done, total) {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || done < 0) return null;
  return Math.round(Math.min(1, done / total) * 100);
}

// Objective units, not score, accuracy or elapsed time. See the panel task log
// for each denominator; 100% does not imply a successful round.
export function getGameProgress(game, state) {
  if (!state) return null;
  switch (game) {
    case 'WhereDoesItGrow': return percent(state.correct, state.deck?.length);
    case 'GardenPlanner': return percent(state.plots?.filter(p => p.harvested).length, state.plots?.length);
    case 'SoilDoctor': return percent(state.healedCount, state.plots?.length);
    case 'SeasonMatcher': return percent(state.basketCount, state.basketSize);
    case 'MarketTrip': return percent(state.stallsDone, state.stalls?.length);
    case 'SpotTheFake': return percent(state.judgedCount, state.products?.length);
    case 'FridgeManager': return percent(state.acceptedCount, state.counterItems?.length);
    case 'MealPlanner': {
      const slots = state.plates?.flatMap(p => p.slots);
      return percent(slots?.filter(s => s.item != null).length, slots?.length);
    }
    case 'LeftoverChef': return percent(state.completedGoals?.length, state.goals?.length);
    case 'CompostCreator': return percent(state.totalPlaced, state.counterItems?.length);
    case 'CircularCity': return percent(state.routedCount, state.resources?.length);
    case 'PlanetaryBoundaries': return percent(state.choicesMade, state.consoles?.length);
    default: return null;
  }
}

const deliver = (type, fields, final) => (final ? trackFinal : track)(type, fields);

export function watchGameAbandonment({ target, mission, island, attemptId, finishedRef, source, timing, send = deliver }) {
  let abandoned = false;
  const abandon = (final) => {
    // COMPLETED may precede the result callback/animation. Do not relabel that
    // interval as abandonment, even if unloading prevents the finish delivery.
    if (abandoned || finishedRef.current || source.current?.completed) return;
    abandoned = true;
    finishedRef.current = true;
    send('game_abandon', {
      ...timing?.finish(),
      island, game: mission, attempt_id: attemptId,
      progress: getGameProgress(mission, source.current?.state),
    }, final);
  };
  const onPageHide = (event) => {
    if (!event.persisted) abandon(true);
  };
  target.addEventListener('pagehide', onPageHide);
  return () => {
    target.removeEventListener('pagehide', onPageHide);
    abandon(false);
  };
}
