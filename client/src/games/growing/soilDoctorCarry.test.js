import { expect, it } from 'vitest';
import { dropSoilRemedy } from './soilDoctorCarry.js';

it.each(['q', 'keyq'])('drops with %s without changing score, health or plots', key => {
  const state = { carrying: 'compost', heldItem: { emoji: 'x' }, actionPrompt: 'treat',
    irisOpenness: 1, score: 25, soilHealth: 80, mistakes: 0, plots: [{ healed: false }] };
  expect(dropSoilRemedy(state, new Set([key]))).toBe(true);
  expect(state).toMatchObject({ carrying: null, heldItem: null, actionPrompt: null,
    score: 25, soilHealth: 80, mistakes: 0, plots: [{ healed: false }] });
  state.carrying = 'cover';
  expect(dropSoilRemedy(state, new Set([key]))).toBe(false);
  dropSoilRemedy(state, new Set());
  expect(dropSoilRemedy(state, new Set([key]))).toBe(true);
});
it('does not drop during a card or queue a held key for after it closes', () => {
  const state = { carrying: 'compost', irisOpenness: 1, diagnosisCard: {} };
  expect(dropSoilRemedy(state, new Set(['q']))).toBe(false);
  state.diagnosisCard = null;
  expect(dropSoilRemedy(state, new Set(['q']))).toBe(false);
  expect(state.carrying).toBe('compost');
});
