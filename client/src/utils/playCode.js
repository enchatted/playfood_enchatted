/**
 * Play Code codec — turns the player's full progress into a short, friendly,
 * pronounceable word phrase (e.g. "kati-milo-tovo-bera-sina-domu-vako-lehi-rofa").
 * Fully client-side: generated on exit, restored on paste, NO server.
 *
 * How it stays short while carrying everything:
 *   1. The 13 progress fields are bit-packed into a fixed 105-bit payload
 *      (masks for missions/codes/ceremonies/stars; small ints for points etc.).
 *   2. A 3-bit checksum is prepended → 108 bits.
 *   3. 108 bits split into 9 groups of 12 bits; each group → one CVCV "word"
 *      from a generated 4096-word pronounceable dictionary.
 *
 * Configurable activity IDs use an optional ~ids~checksum suffix; old progress
 * without new activities retains its original nine-word format.
 * decodeProgress returns null on malformed phrases or extensions.
 *
 * ⚠️ The orderings below are FROZEN. Reordering them (or renaming a game) breaks
 * every previously issued code. Append new entries; never reorder existing ones.
 */

import { REDEEM_CODE_ORDER as REDEEM_CODES } from '../data/codes.js';
import {
  legacyBoatTierForCompletedMissions,
  normalizeBoatTier,
} from '../data/boatUpgrades.js';

const SCHEMA_VERSION_2 = 2;
const SCHEMA_VERSION_3 = 3;
const SCHEMA_VERSION_4 = 4;
const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION_4;

// All persisted progress fields a code carries (everything in the store's
// partialize except the removed server playCode).
export const PROGRESS_FIELDS = [
  'language', 'heroId', 'completedMissions', 'points', 'redeemedCodes',
  'ceremoniesSeen', 'reflectionsSeen', 'whaleSpotted', 'recycleTrips',
  'totalRecycled', 'lighthouseGoldSeen', 'gameStars', 'boatTier',
];

// ── Frozen value orderings ───────────────────────────────────────────────
const LANGS = ['en', 'nl', 'el', 'pt'];
const HERO_ORDER = [null, 'pigtails', 'braid', 'short', 'bob']; // index 0 = no hero
const ISLANDS = ['growing', 'local', 'foodwaste', 'circular'];
const MISSION_IDS = [1, 2, 3]; // per island, in the 4×3 structure
const STAR_KEYS = [
  'growing:WhereDoesItGrow', 'growing:GardenPlanner', 'growing:SoilDoctor',
  'local:SeasonMatcher', 'local:MarketTrip', 'local:SpotTheFake',
  'foodwaste:FridgeManager', 'foodwaste:MealPlanner', 'foodwaste:LeftoverChef',
  'circular:CompostCreator', 'circular:CircularCity', 'circular:PlanetaryBoundaries',
];

// ── Bit layout (packed most-significant first, total 105 bits) ───────────
const PAYLOAD_BITS = 105;
const CHECK_BITS = 3;
const WORD_BITS = 12;
const WORD_COUNT = 9; // (105 + 3) / 12

// ── Pronounceable 4096-word dictionary (generated CVCV syllables) ────────
// 16 consonants × 4 vowels = 64 syllables; a word is two syllables (4 letters).
// 'p' and 'u' are left out to dodge the most obvious giggle-words.
const CONS = 'bdfghjklmnrstvwz'.split(''); // 16
const VOWELS = 'aeio'.split('');           // 4
const syllable = (i) => CONS[i >> 2] + VOWELS[i & 3]; // 0..63 → "ba".."zo"

// Fixed 108-bit whitening constant (deterministic). XOR-applied before words
// are emitted so sparse states (e.g. a fresh game) don't render as long runs of
// the same word. Symmetric — XOR-ed back on decode, so it's purely cosmetic.
const WHITEN = (() => {
  let w = 0n;
  let x = 0x9e3779b1n; // seed
  for (let i = 0; i < WORD_COUNT; i++) {
    x = (x * 1103515245n + 12345n) & 0xffffffffn; // LCG
    w = (w << 12n) | ((x >> 8n) & 0xfffn);
  }
  return w; // 9 × 12 = 108 bits
})();

function wordForIndex(i) {
  return syllable((i >> 6) & 63) + syllable(i & 63); // 12-bit → CVCV
}
function indexForWord(w) {
  if (typeof w !== 'string' || w.length !== 4) return -1;
  const c1 = CONS.indexOf(w[0]); const v1 = VOWELS.indexOf(w[1]);
  const c2 = CONS.indexOf(w[2]); const v2 = VOWELS.indexOf(w[3]);
  if (c1 < 0 || v1 < 0 || c2 < 0 || v2 < 0) return -1;
  return ((c1 * 4 + v1) << 6) | (c2 * 4 + v2);
}

// ── Helpers ──────────────────────────────────────────────────────────────
function idxOf(list, value, fallback = 0) {
  const i = list.indexOf(value);
  return i < 0 ? fallback : i;
}
function clampInt(value, bits) {
  const max = (1 << bits) - 1;
  let v = Math.round(Number(value) || 0);
  if (v < 0) v = 0;
  if (v > max) v = max;
  return v;
}
function maskFromList(list, universe) {
  const set = new Set(Array.isArray(list) ? list : []);
  let m = 0;
  universe.forEach((item, i) => { if (set.has(item)) m |= (1 << i); });
  return m;
}
function listFromMask(mask, universe) {
  return universe.filter((_, i) => (mask >> i) & 1);
}
function missionsToMask(cm) {
  let m = 0;
  ISLANDS.forEach((island, i) => {
    const ids = new Set(Array.isArray(cm?.[island]) ? cm[island] : []);
    MISSION_IDS.forEach((id, b) => { if (ids.has(id)) m |= (1 << (i * 3 + b)); });
  });
  return m; // 12 bits
}
function maskToMissions(mask) {
  const cm = {};
  ISLANDS.forEach((island, i) => {
    cm[island] = MISSION_IDS.filter((_, b) => (mask >> (i * 3 + b)) & 1);
  });
  return cm;
}
function starsToValue(gs) {
  let v = 0;
  STAR_KEYS.forEach((key, k) => {
    const s = clampInt(gs?.[key], 2); // 0..3
    v |= (s & 3) << (k * 2);
  });
  return v; // 24 bits
}
function valueToStars(v) {
  const gs = {};
  STAR_KEYS.forEach((key, k) => {
    const s = (v >> (k * 2)) & 3;
    if (s > 0) gs[key] = s; // store only holds recorded (1..3) games
  });
  return gs;
}

function checksumOf(payload) {
  let c = 0;
  let t = payload;
  while (t > 0n) { c ^= Number(t & 7n); t >>= 3n; }
  return c & 7;
}

// ── Pack / unpack ────────────────────────────────────────────────────────
function snapshotToPayload(s) {
  const fields = [
    [CURRENT_SCHEMA_VERSION, 4],
    [idxOf(LANGS, s.language), 2],
    [idxOf(HERO_ORDER, s.heroId), 3],
    [missionsToMask(s.completedMissions), 12],
    [clampInt(s.points, 16), 16],
    [maskFromList(s.redeemedCodes, REDEEM_CODES), 5],
    [maskFromList(s.ceremoniesSeen, ISLANDS), 4],
    [maskFromList(s.reflectionsSeen, ISLANDS), 4],
    [s.whaleSpotted ? 1 : 0, 1],
    [clampInt(s.recycleTrips, 7), 7],
    [clampInt(s.totalRecycled, 16), 16],
    [maskFromList(s.lighthouseGoldSeen, ISLANDS), 4],
    [starsToValue(s.gameStars), 24],
    [normalizeBoatTier(s.boatTier, s.completedMissions), 3],
  ];
  let n = 0n;
  for (const [value, bits] of fields) {
    n = (n << BigInt(bits)) | (BigInt(value) & ((1n << BigInt(bits)) - 1n));
  }
  return n; // PAYLOAD_BITS-wide BigInt
}

function getPayloadVersion(payload) {
  return Number((payload >> BigInt(PAYLOAD_BITS - 4)) & 0xfn);
}

function payloadV2ToSnapshot(payload) {
  let n = payload;
  const pop = (bits) => {
    const v = Number(n & ((1n << BigInt(bits)) - 1n));
    n >>= BigInt(bits);
    return v;
  };
  // LSB-first = reverse of the pack order above
  const stars = pop(24);
  const gold = pop(4);
  const totalRecycled = pop(16);
  const recycleTrips = pop(10);
  const whale = pop(1);
  const reflections = pop(4);
  const ceremonies = pop(4);
  const redeemed = pop(5);
  const points = pop(16);
  const missions = pop(12);
  const heroIdx = pop(3);
  const langIdx = pop(2);
  const version = pop(4);
  if (version !== SCHEMA_VERSION_2) return null;

  const completedMissions = maskToMissions(missions);
  return {
    v: version,
    language: LANGS[langIdx] || 'en',
    heroId: heroIdx < HERO_ORDER.length ? HERO_ORDER[heroIdx] : null,
    completedMissions,
    points,
    redeemedCodes: listFromMask(redeemed, REDEEM_CODES),
    ceremoniesSeen: listFromMask(ceremonies, ISLANDS),
    reflectionsSeen: listFromMask(reflections, ISLANDS),
    whaleSpotted: !!whale,
    recycleTrips,
    totalRecycled,
    lighthouseGoldSeen: listFromMask(gold, ISLANDS),
    gameStars: valueToStars(stars),
    boatTier: legacyBoatTierForCompletedMissions(completedMissions),
  };
}

function payloadV3ToSnapshot(payload) {
  let n = payload;
  const pop = (bits) => {
    const v = Number(n & ((1n << BigInt(bits)) - 1n));
    n >>= BigInt(bits);
    return v;
  };
  // LSB-first = reverse of the v3 pack order above
  const boatTier = pop(2);
  const stars = pop(24);
  const gold = pop(4);
  const totalRecycled = pop(16);
  const recycleTrips = pop(8);
  const whale = pop(1);
  const reflections = pop(4);
  const ceremonies = pop(4);
  const redeemed = pop(5);
  const points = pop(16);
  const missions = pop(12);
  const heroIdx = pop(3);
  const langIdx = pop(2);
  const version = pop(4);
  if (version !== SCHEMA_VERSION_3) return null;

  return {
    v: version,
    language: LANGS[langIdx] || 'en',
    heroId: heroIdx < HERO_ORDER.length ? HERO_ORDER[heroIdx] : null,
    completedMissions: maskToMissions(missions),
    points,
    redeemedCodes: listFromMask(redeemed, REDEEM_CODES),
    ceremoniesSeen: listFromMask(ceremonies, ISLANDS),
    reflectionsSeen: listFromMask(reflections, ISLANDS),
    whaleSpotted: !!whale,
    recycleTrips,
    totalRecycled,
    lighthouseGoldSeen: listFromMask(gold, ISLANDS),
    gameStars: valueToStars(stars),
    boatTier,
  };
}

function payloadV4ToSnapshot(payload) {
  let n = payload;
  const pop = (bits) => {
    const v = Number(n & ((1n << BigInt(bits)) - 1n));
    n >>= BigInt(bits);
    return v;
  };
  // LSB-first = reverse of the v4 pack order above
  const boatTier = pop(3);
  const stars = pop(24);
  const gold = pop(4);
  const totalRecycled = pop(16);
  const recycleTrips = pop(7);
  const whale = pop(1);
  const reflections = pop(4);
  const ceremonies = pop(4);
  const redeemed = pop(5);
  const points = pop(16);
  const missions = pop(12);
  const heroIdx = pop(3);
  const langIdx = pop(2);
  const version = pop(4);
  if (version !== SCHEMA_VERSION_4) return null;

  return {
    v: version,
    language: LANGS[langIdx] || 'en',
    heroId: heroIdx < HERO_ORDER.length ? HERO_ORDER[heroIdx] : null,
    completedMissions: maskToMissions(missions),
    points,
    redeemedCodes: listFromMask(redeemed, REDEEM_CODES),
    ceremoniesSeen: listFromMask(ceremonies, ISLANDS),
    reflectionsSeen: listFromMask(reflections, ISLANDS),
    whaleSpotted: !!whale,
    recycleTrips,
    totalRecycled,
    lighthouseGoldSeen: listFromMask(gold, ISLANDS),
    gameStars: valueToStars(stars),
    boatTier,
  };
}

function payloadToSnapshot(payload) {
  const version = getPayloadVersion(payload);
  if (version === SCHEMA_VERSION_2) return payloadV2ToSnapshot(payload);
  if (version === SCHEMA_VERSION_3) return payloadV3ToSnapshot(payload);
  if (version === SCHEMA_VERSION_4) return payloadV4ToSnapshot(payload);
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────
// Optional extension for configurable activities. This detects copy errors;
// like the legacy Play Code, it is not an authentication/signature mechanism.
function activityChecksum(text) {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function encodeProgress(state) {
  const payload = snapshotToPayload(state);
  const full = (BigInt(checksumOf(payload)) << BigInt(PAYLOAD_BITS)) | payload;
  const whitened = full ^ WHITEN;
  const words = [];
  for (let i = WORD_COUNT - 1; i >= 0; i--) {
    words.push(wordForIndex(Number((whitened >> BigInt(WORD_BITS * i)) & 0xfffn)));
  }
  const base = words.join('-');
  const extra = (state.redeemedCodes || []).filter(id => !REDEEM_CODES.includes(id));
  if (!extra.length) return base;
  if (new Set(extra).size !== extra.length || extra.length > 100
    || extra.some(id => typeof id !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(id))) {
    throw new Error('Invalid activity progress');
  }
  const extended = `${base}~${extra.join(',').toLowerCase()}`;
  return `${extended}~${activityChecksum(extended)}`;
}

export function decodeProgress(code) {
  if (typeof code !== 'string') return null;
  if (code.length > 4096) return null;
  if (code.includes('~')) {
    const parts = code.trim().toLowerCase().split('~');
    if (parts.length !== 3 || activityChecksum(`${parts[0]}~${parts[1]}`) !== parts[2]) return null;
    const base = decodeProgress(parts[0]);
    const ids = parts[1].toUpperCase().split(',');
    if (!base || ids.some(id => !/^[A-Z][A-Z0-9_]{0,31}$/.test(id))) return null;
    const combined = [...base.redeemedCodes, ...ids];
    if (combined.length > 100 || new Set(combined).size !== combined.length) return null;
    return { ...base, redeemedCodes: combined };
  }
  const words = code.trim().toLowerCase().split(/[-\s]+/).filter(Boolean);
  if (words.length !== WORD_COUNT) return null;

  let whitened = 0n;
  for (const w of words) {
    const i = indexForWord(w);
    if (i < 0) return null;
    whitened = (whitened << BigInt(WORD_BITS)) | BigInt(i);
  }
  const full = whitened ^ WHITEN;
  const payload = full & ((1n << BigInt(PAYLOAD_BITS)) - 1n);
  const checksum = Number((full >> BigInt(PAYLOAD_BITS)) & 7n);
  if (checksum !== checksumOf(payload)) return null;

  return payloadToSnapshot(payload);
}
