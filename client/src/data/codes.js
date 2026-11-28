/**
 * Frozen legacy catalogue for reading old Play Codes, NOT live rewards.
 * Live codes and points are configured in server/phygital-codes.json.
 *
 * Never modify this legacy list: its order is part of the old bit-mask contract.
 * New activity IDs travel in the Play Code extension instead.
 */
export const PHYGITAL_CODES = Object.freeze([
  Object.freeze({ code: 'SAVEIT', island: 'foodwaste', points: 50, task: 'Check what expires in the fridge' }),
  Object.freeze({ code: 'LOCALF', island: 'local', points: 50, task: 'Buy something local' }),
  Object.freeze({ code: 'SEASON', island: 'local', points: 50, task: 'Eat something seasonal today' }),
  Object.freeze({ code: 'GROWIT', island: 'growing', points: 50, task: 'Grow or care for a plant' }),
  Object.freeze({ code: 'COMPOS', island: 'circular', points: 50, task: 'Try composting' }),
]);

export const REDEEM_CODE_ORDER = Object.freeze(
  PHYGITAL_CODES.map(({ code }) => code),
);

export const VALID_CODES = Object.freeze(Object.fromEntries(
  PHYGITAL_CODES.map(({ code, ...definition }) => [code, Object.freeze(definition)]),
));
