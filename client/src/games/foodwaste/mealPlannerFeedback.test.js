import { describe, expect, it } from 'vitest';
import * as MealPlannerModule from './MealPlanner.jsx';
import { SCENARIOS } from '../../data/foodwaste.js';

const labels = {
  nameOf: (id) => ({ tofu: 'Τόφου', apple: 'Μήλο' }[id] || id),
  alreadyHave: (id) => `Έχεις ήδη: ${id}.`,
  plantNudge: 'Δοκίμασε φυτική πρωτεΐνη.',
  placedGood: 'Μπράβο!',
  junkNudge: 'Αυτό δεν χωράει στο πιάτο.',
  wrongSocket: 'Δοκίμασε άλλο φαγητό.',
};

const makePlacementState = (heldItem) => ({
  heldItem,
  history: [],
  activePlate: 0,
  plateCenter: { col: 9, row: 7 },
  particles: [],
  floatingTexts: [],
  chef: null,
});

describe('Meal Planner food feedback', () => {
  it('names tofu without reusing the ice-cube dataset placeholder', () => {
    const cue = MealPlannerModule.getMealPlannerFoodCue?.(
      { id: 'tofu', emoji: '🧊' },
      labels,
    );

    expect(cue).toBe('Τόφου');
    expect(cue).not.toContain('🧊');
    expect(MealPlannerModule.getMealPlannerFoodCue?.(
      { id: 'apple', emoji: '🍎' },
      labels,
    )).toBe('🍎 Μήλο');
  });

  it('uses the tofu name in the real placement feedback', () => {
    const state = makePlacementState(
      { id: 'tofu', emoji: '🧊', source: 'market', fridgeRef: null },
    );
    const plate = {
      meal: 'lunch',
      slots: [{ type: 'protein', item: null, source: null, emoji: null }],
    };

    MealPlannerModule.placeHeld?.(state, plate, [], labels);

    expect(state.floatingTexts.at(-1)?.text).toBe('Τόφου');
    expect(state.floatingTexts.at(-1)?.text).not.toContain('🧊');
  });

  it('does not open the coach for a normal correct placement', () => {
    const state = makePlacementState(
      { id: 'tofu', emoji: '🧊', source: 'market', fridgeRef: null },
    );
    const plate = {
      meal: 'lunch',
      slots: [{ type: 'protein', item: null, source: null, emoji: null }],
    };

    MealPlannerModule.placeHeld?.(state, plate, [], labels);

    expect(state.chef).toBeNull();
  });

  it('keeps wrong placements blocked and explains them', () => {
    const heldItem = { id: 'apple', emoji: '🍎', source: 'home', fridgeRef: null };
    const state = makePlacementState(heldItem);
    const plate = {
      meal: 'lunch',
      slots: [{ type: 'protein', item: null, source: null, emoji: null }],
    };

    MealPlannerModule.placeHeld?.(state, plate, [], labels);

    expect(plate.slots[0].item).toBeNull();
    expect(state.heldItem).toBe(heldItem);
    expect(state.chef).toMatchObject({ key: 'wrong', msg: labels.wrongSocket });
  });

  it('shows the plant alternative at most once per run', () => {
    const state = makePlacementState(
      { id: 'chicken', emoji: '🍗', source: 'market', fridgeRef: null },
    );
    const firstPlate = {
      meal: 'lunch',
      slots: [{ type: 'protein', item: null, source: null, emoji: null }],
    };

    MealPlannerModule.placeHeld?.(state, firstPlate, [], labels);
    expect(state.chef).toMatchObject({ key: 'plant', msg: labels.plantNudge });
    expect(state.coachTold.plant).toBe(true);

    state.chef = null;
    state.heldItem = { id: 'chicken', emoji: '🍗', source: 'market', fridgeRef: null };
    const secondPlate = {
      meal: 'dinner',
      slots: [{ type: 'protein', item: null, source: null, emoji: null }],
    };

    MealPlannerModule.placeHeld?.(state, secondPlate, [], labels);
    expect(state.chef).toBeNull();
  });

  it('uses the same one-shot plant alternative for a processed protein choice', () => {
    const state = makePlacementState(
      { id: 'processed_ham', emoji: '🥩', source: 'market', fridgeRef: null },
    );
    const plate = {
      meal: 'lunch',
      slots: [{ type: 'protein', item: null, source: null, emoji: null }],
    };

    MealPlannerModule.placeHeld?.(state, plate, [], labels);

    expect(state.chef).toMatchObject({ key: 'plant', msg: labels.plantNudge });
    expect(state.coachTold.plant).toBe(true);
  });

  it('still teaches a redundant market purchase', () => {
    const state = makePlacementState(
      { id: 'tofu', emoji: '🧊', source: 'market', fridgeRef: null },
    );
    const plate = {
      meal: 'lunch',
      slots: [{ type: 'protein', item: null, source: null, emoji: null }],
    };

    MealPlannerModule.placeHeld?.(state, plate, ['tofu'], labels);

    expect(state.chef).toMatchObject({ key: 'already', msg: 'Έχεις ήδη: tofu.' }); // names the food
  });
});

describe('Meal Planner live score synchronization', () => {
  const emptyState = {
    scenario: { season: 'summer', homeInventory: [] },
    plates: [{ meal: 'breakfast', slots: [{ type: 'fruit', item: null, source: null }] }],
  };

  it('keeps an empty plan at zero without scheduling a redundant score update', () => {
    const setScores = [];
    const helpers = {
      getScore: () => 0,
      setScore: (value) => setScores.push(value),
    };

    expect(MealPlannerModule.syncMealPlannerLiveScore?.(emptyState, helpers)).toBe(0);
    expect(setScores).toEqual([]);
  });

  it('repairs a stale displayed score with setScore rather than an additive update', () => {
    const setScores = [];
    const helpers = {
      getScore: () => 42,
      setScore: (value) => setScores.push(value),
    };

    expect(MealPlannerModule.syncMealPlannerLiveScore?.(emptyState, helpers)).toBe(0);
    expect(setScores).toEqual([0]);
  });

  // 12/10: fixture of the Meal Planner readiness report — 54.82% under the final-state waste rule
  // and under the rule before it. The old 54.64% plan bought a banana and a tomato while both home
  // copies stayed unused; the tomato (no «Use me first!») now counts too, so it scores 47%.
  it('shows raw 54.82% as 54 with zero stars: the HUD never reads 55 without its star', () => {
    const state = {
      scenario: SCENARIOS[0],
      plates: [
        {
          meal: 'breakfast',
          slots: [
            { type: 'carb', item: 'rice', source: 'market' },
            { type: 'protein', item: 'egg', source: 'home' },
            { type: 'fruit', item: 'strawberry', source: 'home' },
            { type: 'fruit', item: 'cherry', source: 'market' },
          ],
        },
        {
          meal: 'lunch',
          slots: [
            { type: 'carb', item: 'rice', source: 'market' },
            { type: 'protein', item: 'lentils', source: 'market' },
            { type: 'veg', item: 'bell_pepper', source: 'market' },
            { type: 'veg', item: 'bell_pepper', source: 'market' },
            { type: 'fruit', item: 'cherry', source: 'market' },
          ],
        },
        {
          meal: 'dinner',
          slots: [
            { type: 'carb', item: null, source: null },
            { type: 'protein', item: null, source: null },
            { type: 'veg', item: null, source: null },
            { type: 'veg', item: null, source: null },
            { type: 'fruit', item: 'cherry', source: 'market' },
          ],
        },
      ],
    };
    const setScores = [];
    const setStars = [];
    const helpers = {
      getScore: () => 54,
      setScore: (value) => setScores.push(value),
    };

    expect(MealPlannerModule.syncMealPlannerLiveScore?.(state, helpers, (stars) => {
      setStars.push(stars);
    })).toBe(54);
    expect(setScores).toEqual([]);
    expect(setStars).toEqual([0]);
    expect(state.liveStars).toBe(0);
  });
});

// Check advice for the selected food, repeated choices and undo.
describe('Meal Planner chef: one piece of advice per choice, closed when it no longer applies', () => {
  const winter = SCENARIOS.find((s) => s.season === 'winter');
  const summer = SCENARIOS.find((s) => s.season === 'summer');
  const L = {
    ...labels,
    alreadyHave: (id) => `ALREADY ${id}`, plantNudge: 'PLANT', mealDone: 'DONE',
    seasonCoach: (season, food) => `SEASON ${season} ${food}`,
  };
  const game = (scenario) => {
    const state = {
      scenario,
      plates: [
        { meal: 'breakfast', slots: ['carb', 'protein', 'fruit', 'fruit'].map((type) => ({ type, item: null, source: null, emoji: null })) },
        { meal: 'lunch', slots: ['carb', 'protein', 'veg', 'veg', 'fruit'].map((type) => ({ type, item: null, source: null, emoji: null })) },
      ],
      fridge: scenario.homeInventory.map((id) => ({ id, used: false })),
      history: [], activePlate: 0, heldItem: null, chef: null,
      plateCenter: { col: 9, row: 7 }, particles: [], floatingTexts: [],
    };
    const live = () => state.fridge.filter((f) => !f.used).map((f) => f.id);
    const place = (id, source) => {
      const ref = source === 'home' ? state.fridge.find((f) => f.id === id && !f.used) : null;
      if (ref) ref.used = true;                                   // grab() marks it taken
      const liveFridge = live();                                  // as computed before Enter
      state.heldItem = { id, emoji: '', source, fridgeRef: ref };
      expect(MealPlannerModule.placeHeld(state, state.plates[state.activePlate], liveFridge, L), `place ${id}`).toBe(true);
      return state.chef;
    };
    const undo = () => MealPlannerModule.dropOrUndo(state);
    return { state, place, undo };
  };

  it('no message for an ordinary choice, and none at all before the first choice (no egg hint)', () => {
    const { state, place } = game(summer);
    expect(state.chef).toBeNull();
    expect(place('egg', 'home')).toBeNull();
    expect(place('bread', 'home')).toBeNull();
    expect(place('cherry', 'market')).toBeNull();                // not in the fridge
  });

  it('«already» for a bought food while the home one is unused — every home food, once per food', () => {
    const { state, place } = game(summer);
    expect(place('banana', 'market')).toMatchObject({ key: 'already', msg: 'ALREADY banana', ref: { plateIdx: 0, socketIdx: 2, foodId: 'banana' } });
    state.chef = null;
    expect(place('banana', 'market'), 'second banana: not repeated').toBeNull();
    state.activePlate = 1;
    expect(place('tomato', 'market'), 'tomato has no «Use me first!» but counts').toMatchObject({ key: 'already', ref: { foodId: 'tomato' } });
  });

  it('no «already» when the home copy is already on a plate (the scorer counts nothing)', () => {
    const { place } = game(summer);
    place('banana', 'home');
    expect(place('banana', 'market')).toBeNull();
  });

  it('Q on the placement the advice talks about closes it at once; Q never opens a message', () => {
    const { state, place, undo } = game(summer);
    place('banana', 'market');
    expect(state.chef?.key).toBe('already');
    undo();
    expect(state.chef).toBeNull();
    expect(state.plates[0].slots[2].item).toBeNull();
    // buying it again: already said → no new message, although the penalty is back
    expect(place('banana', 'market')).toBeNull();
    undo();
    expect(state.chef).toBeNull();
  });

  it('Q on a different placement leaves the advice; Q on the advised one then closes it', () => {
    const { state, place, undo } = game(summer);
    place('banana', 'market');                                   // advice → fruit slot 2
    place('banana', 'market');                                   // no message, fruit slot 3
    expect(state.chef).toMatchObject({ key: 'already', ref: { socketIdx: 2 } });
    undo();                                                      // undoes the second banana
    expect(state.chef).toMatchObject({ key: 'already', ref: { socketIdx: 2 } });
    undo();                                                      // undoes the advised banana
    expect(state.chef).toBeNull();
  });

  it('putting the home copy on a plate closes «already» about it, and only about it', () => {
    const { state, place } = game(summer);
    place('banana', 'market');
    expect(state.chef?.key).toBe('already');
    place('egg', 'home');                                        // another home food: advice stays
    expect(state.chef).toMatchObject({ key: 'already', ref: { foodId: 'banana' } });
    place('banana', 'home');
    expect(state.chef).toBeNull();
  });

  it('Q on the home copy brings the penalty back but no new message', () => {
    const { state, place, undo } = game(summer);
    place('banana', 'market');
    state.chef = null;
    place('banana', 'home');
    undo();                                                      // home banana back to the fridge
    expect(state.fridge.find((f) => f.id === 'banana').used).toBe(false);
    expect(state.chef).toBeNull();
  });

  it('season: once per attempt, only for a food out of season in this scenario', () => {
    const { state, place } = game(winter);
    expect(place('strawberry', 'market')).toMatchObject({ key: 'season', msg: 'SEASON winter strawberry', ref: { foodId: 'strawberry' } });
    state.chef = null;
    expect(place('strawberry', 'market'), 'second strawberry: not repeated').toBeNull();
    const summerGame = game(summer);
    summerGame.state.activePlate = 0;
    expect(summerGame.place('strawberry', 'home'), 'summer strawberry is in season').toBeNull();
  });

  it('priority already > season > plant; the losing advice is not marked as said', () => {
    // synthetic: a bought out-of-season food that is also unused at home
    const scenario = { ...winter, homeInventory: [...winter.homeInventory, 'strawberry'] };
    const { state, place } = game(scenario);
    expect(place('strawberry', 'market')).toMatchObject({ key: 'already' });
    expect(state.coachTold.season, 'season lost the slot → still unsaid').toBe(false);
    state.chef = null;
    expect(place('strawberry', 'market'), 'already said, so season comes now').toMatchObject({ key: 'season' });
  });

  it('nudge_plant: once, for chicken or a processed protein; Q closes it', () => {
    const { state, place, undo } = game(summer);
    expect(place('chicken', 'market')).toMatchObject({ key: 'plant', msg: 'PLANT' });
    undo();
    expect(state.chef).toBeNull();
    expect(place('processed_ham', 'market'), 'already said this attempt').toBeNull();
  });

  it('wrong / junk still win over advice and are not tied to a placement', () => {
    const { state, place } = game(summer);
    place('banana', 'market');
    state.heldItem = { id: 'soda', emoji: '', source: 'market', fridgeRef: null };
    expect(MealPlannerModule.placeHeld(state, state.plates[0], [], L)).toBe(false);
    expect(state.chef).toMatchObject({ key: 'junk' });
    expect(state.chef.ref).toBeUndefined();
  });
});
