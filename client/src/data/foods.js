/**
 * Food items data — used across multiple mini-games
 * Includes names (i18n keys), seasons, carbon values, storage info
 */

export const FOOD_ITEMS = [
  { id: 'milk', emoji: '🥛', shelfDays: 3, co2: 1.9, season: 'all', category: 'dairy', compostable: false },
  { id: 'bread', emoji: '🍞', shelfDays: 1, co2: 0.8, season: 'all', category: 'grain', compostable: true },
  { id: 'yogurt', emoji: '🥛', shelfDays: 5, co2: 1.2, season: 'all', category: 'dairy', compostable: false },
  { id: 'chicken', emoji: '🍗', shelfDays: 2, co2: 5.7, season: 'all', category: 'meat', compostable: false },
  { id: 'apple', emoji: '🍎', shelfDays: 14, co2: 0.3, season: 'autumn', category: 'fruit', compostable: true },
  { id: 'banana', emoji: '🍌', shelfDays: 4, co2: 0.7, season: 'all', category: 'fruit', compostable: true },
  { id: 'lettuce', emoji: '🥬', shelfDays: 3, co2: 0.2, season: 'spring', category: 'vegetable', compostable: true },
  { id: 'cheese', emoji: '🧀', shelfDays: 10, co2: 8.5, season: 'all', category: 'dairy', compostable: false },
  { id: 'tomato', emoji: '🍅', shelfDays: 5, co2: 0.7, season: 'summer', category: 'vegetable', compostable: true },
  { id: 'egg', emoji: '🥚', shelfDays: 21, co2: 3.0, season: 'all', category: 'protein', compostable: true },
  { id: 'strawberry', emoji: '🍓', shelfDays: 3, co2: 0.4, season: 'summer', category: 'fruit', compostable: true },
  { id: 'orange', emoji: '🍊', shelfDays: 14, co2: 0.3, season: 'winter', category: 'fruit', compostable: true },
  { id: 'pumpkin', emoji: '🎃', shelfDays: 30, co2: 0.2, season: 'autumn', category: 'vegetable', compostable: true },
  { id: 'lentils', emoji: '🫘', shelfDays: 365, co2: 0.5, season: 'all', category: 'legume', compostable: false },
  { id: 'beef', emoji: '🥩', shelfDays: 3, co2: 13.0, season: 'all', category: 'meat', compostable: false },
  { id: 'rice', emoji: '🍚', shelfDays: 365, co2: 1.2, season: 'all', category: 'grain', compostable: false },
  { id: 'pasta', emoji: '🍝', shelfDays: 365, co2: 0.9, season: 'all', category: 'grain', compostable: false },
  { id: 'fish', emoji: '🐟', shelfDays: 1, co2: 3.5, season: 'all', category: 'protein', compostable: false },
  { id: 'bell_pepper', emoji: '🫑', shelfDays: 7, co2: 0.4, season: 'summer', category: 'vegetable', compostable: true },
  { id: 'red_pepper', emoji: '🌶️', shelfDays: 7, co2: 0.4, season: 'summer', category: 'vegetable', compostable: true },
  { id: 'cucumber', emoji: '🥒', shelfDays: 5, co2: 0.2, season: 'summer', category: 'vegetable', compostable: true },
  { id: 'corn', emoji: '🌽', shelfDays: 3, co2: 0.5, season: 'summer', category: 'vegetable', compostable: true },
  { id: 'cherry', emoji: '🍒', shelfDays: 5, co2: 0.3, season: 'summer', category: 'fruit', compostable: true },
  { id: 'mandarin', emoji: '🍊', shelfDays: 10, co2: 0.3, season: 'winter', category: 'fruit', compostable: true },
  { id: 'leek', emoji: '🧅', shelfDays: 7, co2: 0.2, season: 'autumn', category: 'vegetable', compostable: true },
  { id: 'chicory', emoji: '🥬', shelfDays: 5, co2: 0.2, season: 'winter', category: 'vegetable', compostable: true },
  { id: 'kale', emoji: '🥦', shelfDays: 5, co2: 0.3, season: 'winter', category: 'vegetable', compostable: true },
  { id: 'mushroom', emoji: '🍄', shelfDays: 3, co2: 0.2, season: 'autumn', category: 'vegetable', compostable: true },

  // ── Plant proteins (vegan) — doc "Protein · Vegan option" (4 first games analysis L96-97).
  // Modelled as `legume` (soy is a legume) so the grader credits them as BOTH plant-forward
  // (sustainability bonus) AND a protein source (nutrition presence).
  { id: 'tofu', emoji: '🧊', shelfDays: 7, co2: 2.0, season: 'all', category: 'legume', compostable: true },
  { id: 'tempeh', emoji: '🍢', shelfDays: 7, co2: 2.0, season: 'all', category: 'legume', compostable: true },

  // ── Extras · NOT HEALTHY — doc "Extras: sodas, chicken nuggets, processed ham, processed
  // sausage, processed burger, processed noodles, frozen lasagna, sugary fruit juices" (L98-100).
  // `processed:true` drives the sustainability PENALTY in foodwaste.js — a deliberate "less
  // healthy meal" consequence (teach-don't-punish), never a red ✗. co2 is nominal data; the
  // penalty is flag-driven, not carbon-driven.
  { id: 'soda', emoji: '🥤', shelfDays: 365, co2: 1.5, season: 'all', category: 'extra', processed: true, compostable: false },
  { id: 'chicken_nuggets', emoji: '🍗', shelfDays: 60, co2: 6.0, season: 'all', category: 'extra', processed: true, compostable: false },
  { id: 'processed_ham', emoji: '🍖', shelfDays: 14, co2: 5.0, season: 'all', category: 'extra', processed: true, compostable: false },
  { id: 'processed_sausage', emoji: '🌭', shelfDays: 14, co2: 5.5, season: 'all', category: 'extra', processed: true, compostable: false },
  { id: 'processed_burger', emoji: '🍔', shelfDays: 30, co2: 7.0, season: 'all', category: 'extra', processed: true, compostable: false },
  { id: 'instant_noodles', emoji: '🍜', shelfDays: 365, co2: 1.6, season: 'all', category: 'extra', processed: true, compostable: false },
  { id: 'frozen_lasagna', emoji: '🥘', shelfDays: 180, co2: 4.5, season: 'all', category: 'extra', processed: true, compostable: false },
  { id: 'sugary_juice', emoji: '🧃', shelfDays: 90, co2: 1.4, season: 'all', category: 'extra', processed: true, compostable: false },
];

/**
 * Pool-based recipes — sandbox mode.
 * Any 3 items from a recipe's pool are valid.
 * `required` items MUST be among the 3 (e.g., Rice Bowl needs rice).
 */
export const RECIPES = [
  { id: 'pasta_salad', emoji: '🥗', pool: ['pasta', 'tomato', 'cheese', 'bell_pepper', 'lettuce', 'cucumber', 'corn'], required: [] },
  { id: 'veggie_wrap', emoji: '🌯', pool: ['lettuce', 'bell_pepper', 'cucumber', 'leek', 'chicory', 'kale'], required: [] },
  { id: 'fruit_bowl', emoji: '🥣', pool: ['apple', 'banana', 'orange', 'cherry', 'mandarin'], required: [] },
  { id: 'rice_bowl', emoji: '🍚', pool: ['rice', 'chicken', 'lentils', 'egg', 'mushroom'], required: ['rice'] },
];

// ─── Food Rescue belt items ────────────────────────────────
// Quality types: good (fresh), ugly (bruised but edible), rotten (compost only)
export const RESCUE_FOOD_POOL = [
  // Good (fresh) — +10 to Donation
  { baseId: 'apple',       emoji: '🍎', quality: 'good',   labelKey: 'foods.apple' },
  { baseId: 'banana',      emoji: '🍌', quality: 'good',   labelKey: 'foods.banana' },
  { baseId: 'bread',       emoji: '🍞', quality: 'good',   labelKey: 'foods.bread' },
  { baseId: 'tomato',      emoji: '🍅', quality: 'good',   labelKey: 'foods.tomato' },
  { baseId: 'lettuce',     emoji: '🥬', quality: 'good',   labelKey: 'foods.lettuce' },
  { baseId: 'orange',      emoji: '🍊', quality: 'good',   labelKey: 'foods.orange' },
  { baseId: 'bell_pepper', emoji: '🫑', quality: 'good',   labelKey: 'foods.bell_pepper' },
  { baseId: 'strawberry',  emoji: '🍓', quality: 'good',   labelKey: 'foods.strawberry' },
  // Ugly (bruised but edible) — +20 to Donation (DOUBLE!)
  { baseId: 'apple',       emoji: '🍎', quality: 'ugly',   labelKey: 'food_rescue.ugly_apple' },
  { baseId: 'banana',      emoji: '🍌', quality: 'ugly',   labelKey: 'food_rescue.ugly_banana' },
  { baseId: 'tomato',      emoji: '🍅', quality: 'ugly',   labelKey: 'food_rescue.ugly_tomato' },
  { baseId: 'orange',      emoji: '🍊', quality: 'ugly',   labelKey: 'food_rescue.ugly_orange' },
  { baseId: 'bell_pepper', emoji: '🫑', quality: 'ugly',   labelKey: 'food_rescue.ugly_pepper' },
  { baseId: 'strawberry',  emoji: '🍓', quality: 'ugly',   labelKey: 'food_rescue.ugly_strawberry' },
  // Rotten (spoiled) — +5 to Compost, no penalty if trashed
  { baseId: 'apple',       emoji: '🍎', quality: 'rotten', labelKey: 'food_rescue.rotten_apple' },
  { baseId: 'banana',      emoji: '🍌', quality: 'rotten', labelKey: 'food_rescue.rotten_banana' },
  { baseId: 'lettuce',     emoji: '🥬', quality: 'rotten', labelKey: 'food_rescue.rotten_lettuce' },
  { baseId: 'bread',       emoji: '🍞', quality: 'rotten', labelKey: 'food_rescue.rotten_bread' },
  { baseId: 'tomato',      emoji: '🍅', quality: 'rotten', labelKey: 'food_rescue.rotten_tomato' },
];

export const COMPOST_ITEMS = [
  { id: 'apple_core', emoji: '🍎', label: 'Apple core', compostable: true },
  { id: 'eggshell', emoji: '🥚', label: 'Eggshells', compostable: true },
  { id: 'banana_peel', emoji: '🍌', label: 'Banana peel', compostable: true },
  { id: 'tea_bag', emoji: '🍵', label: 'Tea bag', compostable: true },
  { id: 'coffee_grounds', emoji: '☕', label: 'Coffee grounds', compostable: true },
  { id: 'leaves', emoji: '🍂', label: 'Dried leaves', compostable: true },
  { id: 'bread_stale', emoji: '🍞', label: 'Stale bread', compostable: true },
  { id: 'carrot_peels', emoji: '🥕', label: 'Carrot peels', compostable: true },
  { id: 'plastic_bag', emoji: '🛍️', label: 'Plastic bag', compostable: false },
  { id: 'styrofoam', emoji: '📦', label: 'Styrofoam', compostable: false },
  { id: 'glass_jar', emoji: '🫙', label: 'Glass jar', compostable: false },
  { id: 'aluminum_can', emoji: '🥫', label: 'Aluminum can', compostable: false },
  { id: 'plastic_wrap', emoji: '🧻', label: 'Plastic wrap', compostable: false },
  { id: 'battery', emoji: '🔋', label: 'Battery', compostable: false },
  { id: 'newspaper', emoji: '📰', label: 'Newspaper', compostable: true },
];
