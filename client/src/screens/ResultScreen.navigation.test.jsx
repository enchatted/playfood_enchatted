import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/index.js';
import ResultScreen from './ResultScreen.jsx';
import { resultNextStep } from '../components/ResultNextStep.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useEffect: vi.fn(),
}));
vi.mock('react-i18next', async (original) => {
  const { default: translations } = await import('i18next');
  return {
    ...await original(),
    useTranslation: () => ({ t: translations.t.bind(translations), i18n: translations }),
  };
});

const ISLAND_BUTTONS = [
  ['en', 'Back to Island'],
  ['el', 'Πίσω στο νησί'],
  ['nl', 'Terug naar het eiland'],
  ['pt', 'Voltar à ilha'],
];

function buttonsIn(element) {
  if (!React.isValidElement(element)) return [];
  return [
    ...(element.type === 'button' ? [element] : []),
    ...React.Children.toArray(element.props.children).flatMap(buttonsIn),
  ];
}

afterEach(() => i18n.changeLanguage('en'));

describe('result navigation labels match their destinations', () => {
  it.each(ISLAND_BUTTONS)('%s: the success button returns to the island and the map button stays separate', async (lang, label) => {
    await i18n.changeLanguage(lang);
    const onNavigate = vi.fn();
    const buttons = buttonsIn(ResultScreen({
      island: 'growing', mission: 'GardenPlanner', missionId: 2,
      score: 100, passed: true, onNavigate,
    }));

    expect(buttons).toHaveLength(2);
    expect(buttons[0].props.children).toBe(label);
    buttons[0].props.onClick();
    expect(onNavigate).toHaveBeenLastCalledWith('island', { island: 'growing' });
    expect(buttons[1].props.children).toBe(i18n.t('result.back_to_map'));
    buttons[1].props.onClick();
    expect(onNavigate).toHaveBeenLastCalledWith('hub');
  });

  it.each(ISLAND_BUTTONS)('%s: a failed result still retries the same game', async (lang) => {
    await i18n.changeLanguage(lang);
    const onNavigate = vi.fn();
    const buttons = buttonsIn(ResultScreen({
      island: 'growing', mission: 'GardenPlanner', missionId: 2,
      score: 0, passed: false, roundSeed: 27, onNavigate,
    }));

    expect(buttons[0].props.children).toBe(i18n.t('result.try_again'));
    buttons[0].props.onClick();
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('game', {
      island: 'growing', mission: 'GardenPlanner', missionId: 2, roundSeed: 27,
    });
  });
});

describe('result guidance follows saved progress', () => {
  const state = { island: 'growing', mission: 'GardenPlanner', passed: true, ceremoniesSeen: [], finaleClaimed: false };
  const done = { growing: [1, 2, 3], local: [1, 2, 3], foodwaste: [1, 2, 3], circular: [1, 2, 3] };

  it.each([
    [{ completedMissions: { growing: [1] } }, 'top right'],
    [{ completedMissions: { growing: [3] } }, 'top left'],
    [{ completedMissions: { growing: [2, 1] } }, 'bottom right'],
    [{ completedMissions: done }, 'celebration'],
    [{ completedMissions: done, ceremoniesSeen: ['growing'] }, 'lighthouse'],
    [{ completedMissions: done, ceremoniesSeen: ['growing'], finaleClaimed: true }, 'again'],
    [{ completedMissions: { growing: [1, 2, 3] }, ceremoniesSeen: ['growing'] }, 'another island'],
    [{ passed: false, completedMissions: {} }, '5 healthy crops'],
  ])('suggests the reachable action for %o', (progress, expected) => {
    expect(resultNextStep(i18n.getFixedT('en'), { ...state, ...progress })).toContain(expected);
  });
});
