import { describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ effects: [], ref: { current: null } }));
vi.mock('react', async (original) => ({
  ...await original(),
  useState: (init) => [typeof init === 'function' ? 'CODE' : init, vi.fn()],
  useEffect: (fn) => { hooks.effects.push(fn); },
  useRef: () => hooks.ref,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../store/gameStore.js', () => ({ default: () => vi.fn() }));
vi.mock('../utils/playCode.js', () => ({ encodeProgress: () => 'CODE' }));
import React from 'react';
import ExitOverlay from './ExitOverlay.jsx';

globalThis.React = React; // tests use the classic JSX transform

describe('exit overlay opens at the top of the card', () => {
  it('focuses Keep playing without scrolling the Play Code out of view', () => {
    const tree = ExitOverlay({ onNavigateToStart: vi.fn(), onKeepPlaying: vi.fn() });
    const buttons = tree.props.children.props.children.filter((c) => c?.type === 'button');
    const keep = buttons.find((b) => b.props.children === 'exit.keep_playing');
    expect(keep.props.autoFocus).toBeUndefined();
    expect(keep.ref).toBe(hooks.ref);

    const focus = vi.fn();
    hooks.ref.current = { focus };
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    hooks.effects.forEach((fn) => fn());
    vi.unstubAllGlobals();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
