import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import el from '../../i18n/locales/el.json';
import en from '../../i18n/locales/en.json';
import nl from '../../i18n/locales/nl.json';
import pt from '../../i18n/locales/pt.json';

const control = vi.hoisted(() => ({ state: {}, status: 'PLAYING', locale: null }));
vi.mock('../hooks/useGameRoomCanvas.js', () => ({ default: () => ({
  gameState: control.status, setGameState: () => {}, score: 0, stateRef: { current: control.state },
}) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key.split('.').reduce((v, part) => v?.[part], control.locale) || key }) }));
vi.mock('../../components/PauseOverlay.jsx', () => ({ default: () => <div>Paused</div> }));
vi.mock('../../components/ExitConfirmButton.jsx', () => ({ default: () => <button>Exit</button> }));
import CompostCreator from './CompostCreator.jsx';

const render = () => renderToStaticMarkup(<CompostCreator onComplete={() => {}} onNavigate={() => {}} />);

beforeEach(() => {
  control.status = 'PLAYING';
  control.locale = el;
  control.state = { revealList: [], revealIndex: 0, focusedItem: { id: 'tea_bag', nameKey: 'compost_items.tea_bag', emoji: '🫖' } };
});

describe('Compost focused item retains its visible identifying properties', () => {
  it.each(Object.entries({ el, en, nl, pt }))('renders the complete approved %s tea label before selecting a bin', (_, locale) => {
    control.locale = locale;
    const html = render();
    expect(html).toContain('data-testid="compost-focused-item"');
    expect(html).toContain(locale.compost_items.tea_bag);
    const pill = html.match(/<div data-testid="compost-focused-item"[^>]*>[\s\S]*?<\/div>/)?.[0];
    expect(pill).toBeTruthy();
    expect(pill).not.toContain('text-overflow');
    expect(pill).not.toContain('max-height');
  });

  it.each(['showMissionIntro', 'revealing', 'factCard', 'exitConfirmOpen'])('hides the pill when %s owns the scene', (flag) => {
    control.state[flag] = true;
    expect(render()).not.toContain('data-testid="compost-focused-item"');
  });

  it('hides it during pause and restores it when play resumes', () => {
    control.status = 'PAUSED';
    expect(render()).not.toContain('data-testid="compost-focused-item"');
    control.status = 'PLAYING';
    expect(render()).toContain('data-testid="compost-focused-item"');
  });
});
