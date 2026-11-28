import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FOOD_SAFETY_SOURCE, FOOD_SAFETY_FACTS, LEFTOVER_ITEMS, RESCUE_GOALS,
  LEFTOVER_INTRO_FACT, meetsGoal, unmetItems, safetyFactForDish,
  ITEM_RULE_PRIORITY, GENERAL_DISH_FACTS, RESCUE_IDEAS, NEUTRAL_IDEA, rescueIdeaForDish,
  undoLastPotItem, gradeLeftoverChef, liveLeftoverStars,
} from './leftoverChef.js';
import { SOURCES, getMissionSources } from './sources.js';
import en from '../i18n/locales/en.json';
import el from '../i18n/locales/el.json';
import nl from '../i18n/locales/nl.json';
import pt from '../i18n/locales/pt.json';

// Check each quoted passage in the source viewer, accounting for escaped apostrophes.
const SOURCE_HTML_RAW = readFileSync(
  fileURLToPath(new URL('../../public/source.html', import.meta.url)),
  'utf8',
);
const SOURCE_HTML = SOURCE_HTML_RAW.replace(/\\'/g, "'");
const verbatimCore = (q) => q.replace(/^[…\s]+/, '').replace(/[…\s]+$/, '').trim();

function expectPlainSentence(plain, label) {
  expect(typeof plain, `${label}: plain must be a string`).toBe('string');
  expect(plain.length, `${label}: plain must be non-empty`).toBeGreaterThan(0);
  expect(plain.startsWith('…'), `${label}: plain must not open with an ellipsis`).toBe(false);
  expect(/[.!?]$/.test(plain), `${label}: plain must end as a sentence`).toBe(true);
  expect(/[—–]/.test(plain), `${label}: plain must not contain a dash`).toBe(false);
}

describe('LeftoverChef — food-safety verbatim LOCK', () => {
  // EXACT verbatim from live EUFIC food-safety (Last Updated 19 Nov 2025), content-checked
  // 16.06, source-go. The two_hour quote keeps its honest elision («…» = marked omission).
  it('locks the 5 EUFIC verbatim word-for-word', () => {
    expect(FOOD_SAFETY_FACTS.leftovers_days.quote).toBe('Eat leftovers within 2-3 days.');
    expect(FOOD_SAFETY_FACTS.rice_one_day.quote).toBe(
      'Rice dishes should be used within 1 day, because rice can contain spores of Bacillus cereus that can survive cooking, and these can grow into bacteria.',
    );
    expect(FOOD_SAFETY_FACTS.freezing.quote).toBe(
      'freezing food does not kill bacteria but rather slows down their growth significantly.',
    );
    expect(FOOD_SAFETY_FACTS.reheat_once.quote).toBe(
      'do not heat it a second time and do not freeze it a second time either.',
    );
    expect(FOOD_SAFETY_FACTS.two_hour.quote).toBe(
      "Remember the '2-hour rule': … cool and place foods in the fridge within 2 hours.",
    );
  });

  it('every fact cites the registered EUFIC source', () => {
    for (const f of Object.values(FOOD_SAFETY_FACTS)) {
      expect(f.sourceId).toBe(FOOD_SAFETY_SOURCE);
      expect(SOURCES[f.sourceId], f.sourceId).toBeTruthy();
    }
  });

  it('MISSION_SOURCES.LeftoverChef resolves and includes the food-safety source', () => {
    const srcs = getMissionSources('LeftoverChef');
    expect(srcs.length).toBeGreaterThanOrEqual(1);
    expect(srcs.map((s) => s.id)).toContain('food-storage-fridge-freezer-cupboard');
  });

  // The MissionIntroCard fact must REUSE an already-locked verbatim
  // pair. The 2-3-days rule frames the game's urgency (rescue before spoiling); this
  // lock pins the derived intro constant to FOOD_SAFETY_FACTS.leftovers_days.
  it('LEFTOVER_INTRO_FACT reuses the locked 2-3-days verbatim (no new claim)', () => {
    expect(LEFTOVER_INTRO_FACT).toMatchObject({
      sourceId: FOOD_SAFETY_SOURCE,
      quote: FOOD_SAFETY_FACTS.leftovers_days.quote,
      plain: FOOD_SAFETY_FACTS.leftovers_days.plain,
    });
  });
});

// The card has a plain explanation and the linked source contains the exact quotation.
describe('LeftoverChef — quote/plain layers', () => {
  it('every locked quote is verbatim in the source viewer (unescaped)', () => {
    // two_hour keeps an honest elision: each side must be found on its own.
    for (const [id, f] of Object.entries(FOOD_SAFETY_FACTS)) {
      const parts = f.quote.includes('…')
        ? f.quote.split('…').map(verbatimCore).filter(Boolean)
        : [verbatimCore(f.quote)];
      for (const part of parts) {
        expect(SOURCE_HTML.includes(part), `${id}: ${part}`).toBe(true);
      }
    }
  });

  it('every fact has a child-facing plain sentence (never a fragment)', () => {
    for (const [id, f] of Object.entries(FOOD_SAFETY_FACTS)) {
      expectPlainSentence(f.plain, id);
    }
  });

  it('leftover_chef.facts has a non-empty translation for every fact in el/nl/pt', () => {
    for (const [lname, loc] of [['el', el], ['nl', nl], ['pt', pt]]) {
      for (const id of Object.keys(FOOD_SAFETY_FACTS)) {
        const val = loc.leftover_chef?.facts?.[id];
        expect(val, `${lname} missing leftover_chef.facts.${id}`).toBeTruthy();
        expectPlainSentence(val, `${lname}.${id}`);
      }
    }
  });
});

describe('LeftoverChef — goal-matching (teach-don\'t-punish reframe)', () => {
  it('a dish meets a goal when it uses the at-risk items — extras never fail', () => {
    const goal = RESCUE_GOALS[0];
    expect(meetsGoal([...goal.atRisk], goal)).toBe(true);
    expect(meetsGoal([...goal.atRisk, 'egg', 'cheese_end'], goal)).toBe(true);
    expect(meetsGoal([goal.atRisk[0]], goal)).toBe(false);
  });

  it('unmetItems reports what is still to rescue (drives the amber nudge)', () => {
    const goal = RESCUE_GOALS[0];
    expect(unmetItems([goal.atRisk[0]], goal)).toEqual([goal.atRisk[1]]);
    expect(unmetItems([...goal.atRisk], goal)).toEqual([]);
  });

  it('every goal at-risk id is a real leftover item', () => {
    const ids = new Set(LEFTOVER_ITEMS.map((i) => i.id));
    for (const g of RESCUE_GOALS) for (const id of g.atRisk) expect(ids.has(id), id).toBe(true);
  });
});

describe('LeftoverChef — safetyFactForDish', () => {
  it('surfaces the most specific item rule, else the general leftovers rule', () => {
    expect(safetyFactForDish(['leftover_rice', 'egg']).key).toBe('rice_one_day');
    expect(safetyFactForDish(['frozen_peas']).key).toBe('freezing');
    expect(safetyFactForDish(['roast_chicken']).key).toBe('reheat_once');
    expect(safetyFactForDish(['wilted_lettuce', 'ripe_tomato']).key).toBe('leftovers_days');
  });
});

describe('LeftoverChef — child-safe recovery and result grading', () => {
  it('returns the most recently added pot item without mutating the original pot', () => {
    const pot = [{ id: 'leftover_rice' }, { id: 'half_onion' }];
    expect(undoLastPotItem(pot)).toEqual({
      item: { id: 'half_onion' },
      remaining: [{ id: 'leftover_rice' }],
    });
    expect(pot).toHaveLength(2);
  });

  it('does nothing safely when the pot is empty', () => {
    expect(undoLastPotItem([])).toEqual({ item: null, remaining: [] });
  });

  it('grades from the real number of rescued goals', () => {
    expect(gradeLeftoverChef(3, 3)).toBe('perfect');
    expect(gradeLeftoverChef(2, 3)).toBe('pass');
    expect(gradeLeftoverChef(1, 3)).toBe('fail');
  });

  it('shows one live star per rescued goal and never exceeds three', () => {
    expect(liveLeftoverStars(0)).toBe(0);
    expect(liveLeftoverStars(25)).toBe(1);
    expect(liveLeftoverStars(50)).toBe(2);
    expect(liveLeftoverStars(75)).toBe(3);
    expect(liveLeftoverStars(100)).toBe(3);
  });
});

describe('LeftoverChef — clear controls and result copy in every locale', () => {
  const locales = { en, el, nl, pt };
  const touchWords = { en: /tap/i, el: /άγγιξ/i, nl: /tik/i, pt: /toca/i };
  const timerWords = { en: /time/i, el: /χρόν/i, nl: /tijd/i, pt: /tempo/i };

  it('names the selected leftover and states the active goal number', () => {
    for (const [language, locale] of Object.entries(locales)) {
      expect(locale.leftover_chef.pickup_prompt, language).toContain('{{food}}');
      expect(locale.leftover_chef.goal_progress, language).toContain('{{current}}');
      expect(locale.leftover_chef.goal_progress, language).toContain('{{total}}');
    }
  });

  it('explains pot undo, modal continuation and touch source access', () => {
    for (const [language, locale] of Object.entries(locales)) {
      expect(locale.leftover_chef.undo_pot_prompt, language).toBeTruthy();
      expect(locale.leftover_chef.fact_continue_prompt, language).toBeTruthy();
      expect(locale.leftover_chef.press_s, language).toMatch(touchWords[language]);
    }
  });

  it('has child-facing result tiers and a real rescued-goals summary', () => {
    for (const [language, locale] of Object.entries(locales)) {
      for (const tier of ['perfect', 'pass', 'fail']) {
        expect(locale.leftover_chef.results[`tier_${tier}_title`], `${language}.${tier}.title`).toBeTruthy();
        expect(locale.leftover_chef.results[`tier_${tier}_body`], `${language}.${tier}.body`).toBeTruthy();
      }
      expect(locale.leftover_chef.results.summary, language).toContain('{{completed}}');
      expect(locale.leftover_chef.results.summary, language).toContain('{{total}}');
    }
  });

  it('does not promise a countdown in the calm, untimed mission', () => {
    for (const [language, locale] of Object.entries(locales)) {
      expect(locale.missionIntro.leftoverchef.goal, language).not.toMatch(timerWords[language]);
    }
  });
});

// Use the scientific term for spores in each language.
describe('LeftoverChef — rice spores are named correctly in every language', () => {
  it('uses spores, not seeds, in the rice safety card', () => {
    expect(el.leftover_chef.facts.rice_one_day).toContain('μικροσκοπικά σπόρια');
    expect(el.leftover_chef.facts.rice_one_day).not.toMatch(/σπόρ(ους|οι|ων)/);
    expect(nl.leftover_chef.facts.rice_one_day).toMatch(/sporen/);
    expect(nl.leftover_chef.facts.rice_one_day).not.toMatch(/zaad|zaden/);
    expect(pt.leftover_chef.facts.rice_one_day).toMatch(/esporos/);
    expect(pt.leftover_chef.facts.rice_one_day).not.toMatch(/semente/);
  });
});

describe('LeftoverChef — safety card does not depend on order and does not repeat', () => {
  const ITEMS_WITH_RULE = LEFTOVER_ITEMS.filter((i) => i.safety);
  const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));

  it('every rule is either an item rule or a general rule, exactly once', () => {
    expect([...ITEM_RULE_PRIORITY, ...GENERAL_DISH_FACTS].sort()).toEqual(Object.keys(FOOD_SAFETY_FACTS).sort());
    for (const k of GENERAL_DISH_FACTS) expect(FOOD_SAFETY_FACTS[k], k).toBeTruthy();
  });

  it('the same dish gives the same card in any order (every 2- and 3-item dish)', () => {
    const ids = LEFTOVER_ITEMS.map((i) => i.id);
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      for (let c = b; c <= ids.length; c++) {
        const dish = c === b ? [ids[a], ids[b]] : (c < ids.length ? [ids[a], ids[b], ids[c]] : null);
        if (!dish) continue;
        const keys = new Set(perms(dish).map((d) => safetyFactForDish(d, ['leftovers_days']).key));
        expect(keys.size, dish.join('+')).toBe(1);
      }
    }
  });

  it('the strictest rule wins: rice is never hidden behind another item', () => {
    for (const other of ITEMS_WITH_RULE.filter((i) => i.id !== 'leftover_rice')) {
      expect(safetyFactForDish([other.id, 'leftover_rice']).key).toBe('rice_one_day');
    }
    expect(safetyFactForDish(['frozen_peas', 'roast_chicken']).key).toBe('reheat_once');
    expect(safetyFactForDish(['veg_soup', 'frozen_peas']).key).toBe('freezing');
    expect(safetyFactForDish(['cooked_pasta', 'frozen_peas']).key).toBe('freezing');
  });

  it('a dish without its own rule gets a general rule not shown just before', () => {
    expect(safetyFactForDish(['wilted_lettuce', 'ripe_tomato'], ['leftovers_days']).key).toBe('two_hour');
    expect(safetyFactForDish(['stale_bread', 'brown_banana'], ['leftovers_days', 'two_hour', 'rice_one_day']).key).toBe('leftovers_days');
  });

  it('the usual play-through shows no card twice in a row (intro included)', () => {
    const shown = ['leftovers_days'];
    for (const goal of RESCUE_GOALS) {
      const key = safetyFactForDish(goal.atRisk, shown).key;
      expect(key, goal.id).not.toBe(shown[shown.length - 1]);
      shown.push(key);
    }
    expect(shown).toEqual(['leftovers_days', 'two_hour', 'rice_one_day', 'leftovers_days']);
  });

  it('an extra item with a general rule (pasta, soup) never repeats the card just shown', () => {
    // review finding: lettuce + tomato + pasta right after the intro used to give 2-3 days again
    expect(safetyFactForDish(['wilted_lettuce', 'ripe_tomato', 'cooked_pasta'], ['leftovers_days']).key).toBe('two_hour');
    expect(safetyFactForDish(['stale_bread', 'brown_banana', 'veg_soup'], ['leftovers_days', 'two_hour']).key).toBe('leftovers_days');
    // every dish of every goal plus any one extra item, after any history: no back-to-back repeat
    for (const goal of RESCUE_GOALS) for (const extra of LEFTOVER_ITEMS) {
      if (goal.atRisk.includes(extra.id)) continue;
      for (const last of GENERAL_DISH_FACTS) {
        const key = safetyFactForDish([...goal.atRisk, extra.id], ['leftovers_days', last]).key;
        if (GENERAL_DISH_FACTS.includes(key)) expect(key, `${goal.id}+${extra.id} after ${last}`).not.toBe(last);
      }
    }
  });

  it('reopening the instructions counts as showing the 2-3 days rule', () => {
    const src = readFileSync(fileURLToPath(new URL('../games/foodwaste/LeftoverChef.jsx', import.meta.url)), 'utf8');
    expect(src).toMatch(/const reopenInstructions = \(state\) => \{[\s\S]*?shownFactKeys\.push\('leftovers_days'\)/);
    expect(src.match(/reopenInstructions\(/g).length).toBe(2); // ScoreBar + PauseOverlay buttons
  });
});

describe('LeftoverChef — «Ιδέα αξιοποίησης» rescue ideas', () => {
  const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
  // The approved table (01/10): goal → extra item ('' = none) → idea id; anything else is neutral.
  const APPROVED = {
    rescue_veg: { '': 'veg_soup_basic', veg_soup: 'veg_soup_richer', frozen_peas: 'veg_soup_peas', cooked_pasta: 'veg_soup_pasta', roast_chicken: 'veg_soup_chicken', egg: 'veg_soup_egg', cheese_end: 'veg_soup_cheese' },
    rescue_rice: { '': 'fried_rice_onion', egg: 'fried_rice_egg', frozen_peas: 'fried_rice_peas', roast_chicken: 'fried_rice_chicken', cheese_end: 'baked_rice_cheese', veg_soup: 'rice_soup', cooked_pasta: 'neutral' },
    rescue_bread: { '': 'banana_toast', egg: 'french_toast_banana', cheese_end: 'neutral', roast_chicken: 'neutral', veg_soup: 'neutral', frozen_peas: 'neutral', cooked_pasta: 'neutral' },
  };
  // Extras the game lets the child add: not reserved for a later goal and not used by an earlier one.
  const reachableExtras = () => LEFTOVER_ITEMS.map((i) => i.id).filter((id) => !RESCUE_GOALS.some((g) => g.atRisk.includes(id)));

  it('every reachable dish (21) gets the approved idea or the neutral note, in any order', () => {
    let count = 0;
    RESCUE_GOALS.forEach((goal) => {
      for (const extra of ['', ...reachableExtras()]) {
        const dish = extra ? [...goal.atRisk, extra] : [...goal.atRisk];
        const want = APPROVED[goal.id][extra];
        expect(want, `${goal.id}+${extra}`).toBeTruthy();
        for (const order of perms(dish)) expect(rescueIdeaForDish(goal, order).id, `${goal.id}: ${order.join('+')}`).toBe(want);
        count += 1;
      }
    });
    expect(count).toBe(21);
  });

  it('the data has no idea outside the approved table', () => {
    for (const [goalId, ideas] of Object.entries(RESCUE_IDEAS)) {
      for (const [extra, idea] of Object.entries(ideas)) expect(APPROVED[goalId][extra], `${goalId}+${extra}`).toBe(idea.id);
    }
    expect(NEUTRAL_IDEA.id).toBe('neutral');
  });

  const IDEA_IDS = [...new Set(Object.values(RESCUE_IDEAS).flatMap((g) => Object.values(g).map((i) => i.id)))];
  const LOCALES = { el, en, nl, pt };

  it('every idea has a dish name and one sentence in all four languages; the neutral note has text only', () => {
    for (const [lang, loc] of Object.entries(LOCALES)) {
      const lc = loc.leftover_chef;
      expect(lc.idea_title, lang).toBeTruthy();
      for (const id of IDEA_IDS) {
        expect(lc.ideas[id]?.name, `${lang} ${id}`).toBeTruthy();
        expect(lc.ideas[id]?.text, `${lang} ${id}`).toMatch(/\.$/);
      }
      expect(lc.ideas.neutral.name, lang).toBeUndefined();
      expect(lc.ideas.neutral.text, lang).toBeTruthy();
      expect(Object.keys(lc.ideas).sort(), lang).toEqual([...IDEA_IDS, 'neutral'].sort());
    }
  });

  it('every idea sentence names every food in the pot (EN wording)', () => {
    // review finding 01/10: «chicken fried rice» had dropped the onion that is always in the pot
    const WORD = {
      wilted_lettuce: 'lettuce', ripe_tomato: 'tomato', leftover_rice: 'rice', half_onion: 'onion',
      stale_bread: 'bread', brown_banana: 'banana', veg_soup: 'soup', frozen_peas: 'peas',
      cooked_pasta: 'pasta', roast_chicken: 'chicken', egg: 'egg', cheese_end: 'cheese',
    };
    for (const goal of RESCUE_GOALS) {
      for (const [extra, idea] of Object.entries(RESCUE_IDEAS[goal.id])) {
        const foods = extra ? [...goal.atRisk, extra] : goal.atRisk;
        const text = en.leftover_chef.ideas[idea.id].text.toLowerCase();
        for (const f of foods) expect(text, `${idea.id} → ${f}`).toContain(WORD[f]);
      }
    }
  });

  it('extra kitchen basics (water, oil, butter) are named in the child message', () => {
    const NEEDS = {
      veg_soup_basic: ['water', 'oil'], veg_soup_peas: ['water', 'oil'], veg_soup_pasta: ['water', 'oil'],
      veg_soup_chicken: ['water'], veg_soup_egg: ['water', 'oil'], veg_soup_cheese: ['water', 'oil'],
      fried_rice_onion: ['oil'], fried_rice_egg: ['oil'], fried_rice_peas: ['oil'], fried_rice_chicken: ['oil'],
      baked_rice_cheese: ['oil'], french_toast_banana: ['butter', 'oil'],
    };
    const WORD = {
      el: { water: 'νερό', oil: 'λάδι', butter: 'βούτυρο' },
      en: { water: 'water', oil: 'oil', butter: 'butter' },
      nl: { water: 'water', oil: 'olie', butter: 'boter' },
      pt: { water: 'água', oil: 'azeite', butter: 'manteiga' },
    };
    for (const [lang, loc] of Object.entries(LOCALES)) {
      for (const [id, needs] of Object.entries(NEEDS)) {
        for (const n of needs) expect(loc.leftover_chef.ideas[id].text, `${lang} ${id} ${n}`).toContain(WORD[lang][n]);
      }
    }
  });
});

// Show the home suggestion separately from the dish the player made.
describe('Leftover Chef home idea', () => {
  it('is attached only to the bread goal; the other goals have none', async () => {
    const M = await import('./leftoverChef.js');
    expect(M.HOME_IDEAS).toEqual({ rescue_bread: 'bread_tomato' });
    expect(M.homeIdeaForGoal(M.RESCUE_GOALS.find((g) => g.id === 'rescue_bread'))).toBe('bread_tomato');
    expect(M.homeIdeaForGoal(M.RESCUE_GOALS.find((g) => g.id === 'rescue_veg'))).toBeNull();
    expect(M.homeIdeaForGoal(M.RESCUE_GOALS.find((g) => g.id === 'rescue_rice'))).toBeNull();
    expect(M.homeIdeaForGoal(null)).toBeNull();
  });

  it('keeps goals, items, points and dish ideas exactly as they were', async () => {
    const M = await import('./leftoverChef.js');
    expect(M.RESCUE_GOALS).toEqual([
      { id: 'rescue_veg', atRisk: ['wilted_lettuce', 'ripe_tomato'], minMatch: 2 },
      { id: 'rescue_rice', atRisk: ['leftover_rice', 'half_onion'], minMatch: 2 },
      { id: 'rescue_bread', atRisk: ['stale_bread', 'brown_banana'], minMatch: 2 },
    ]);
    expect(M.LEFTOVER_ITEMS).toHaveLength(12);
    expect(M.LEFTOVER_POINTS_PER_GOAL).toBe(25);
    // never offered as a cooked dish: no rescue idea is keyed by bread + tomato
    const goal = M.RESCUE_GOALS.find((g) => g.id === 'rescue_bread');
    expect(M.rescueIdeaForDish(goal, ['stale_bread', 'brown_banana']).id).toBe('banana_toast');
    expect(M.rescueIdeaForDish(goal, ['stale_bread', 'brown_banana', 'egg']).id).toBe('french_toast_banana');
    expect(M.rescueIdeaForDish(goal, ['stale_bread', 'brown_banana', 'cheese_end']).id).toBe('neutral');
    expect(Object.values(M.RESCUE_IDEAS).flatMap((g) => Object.values(g)).map((i) => i.id)).not.toContain('bread_tomato');
  });

  it('has the label and text in all four languages, and the text is not a dish name', async () => {
    const locales = {
      el: (await import('../i18n/locales/el.json')).default,
      en: (await import('../i18n/locales/en.json')).default,
      nl: (await import('../i18n/locales/nl.json')).default,
      pt: (await import('../i18n/locales/pt.json')).default,
    };
    for (const [lang, loc] of Object.entries(locales)) {
      const lc = loc.leftover_chef;
      expect(lc.home_idea_label, lang).toBeTruthy();
      expect(lc.home_ideas?.bread_tomato, lang).toBeTruthy();
      expect(Object.values(lc.ideas).map((i) => i.name)).not.toContain(lc.home_ideas.bread_tomato);
    }
    expect(locales.el.leftover_chef.home_idea_label).toBe('Άλλη ιδέα για το σπίτι:');
    expect(locales.el.leftover_chef.home_ideas.bread_tomato).toBe('ψωμί με ντομάτα, για ένα σάντουιτς.');
    expect(locales.en.leftover_chef.home_idea_label).toBe('Another idea for home:');
    expect(locales.en.leftover_chef.home_ideas.bread_tomato).toBe('bread with tomato, for a sandwich.');
  });
});
