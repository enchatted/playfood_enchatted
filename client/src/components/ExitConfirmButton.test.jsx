import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ confirming: false, set: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original(), useState: () => [state.confirming, state.set],
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
import ExitConfirmButton from './ExitConfirmButton.jsx';

describe('opt-in exit confirmation without changing the HUD footprint', () => {
  beforeEach(() => { state.confirming = false; state.set.mockReset(); });

  it('the first click freezes the game and opens confirmation without exiting', () => {
    const onFreeze = vi.fn();
    const onExit = vi.fn();
    const button = ExitConfirmButton({ onFreeze, onExit, floatingConfirm: true });
    button.props.onClick();
    expect(state.set).toHaveBeenCalledWith(true);
    expect(onFreeze).toHaveBeenCalledWith(true);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('keeps a hidden, unfocusable original button and puts confirmation out of grid flow', () => {
    state.confirming = true;
    const onFreeze = vi.fn();
    const onExit = vi.fn();
    const style = { minWidth: 44, padding: '6px 11px' };
    const anchor = ExitConfirmButton({ onFreeze, onExit, style, floatingConfirm: true });
    const [placeholder, popup] = anchor.props.children;
    expect(placeholder.props.style).toEqual({ ...style, visibility: 'hidden' });
    expect(placeholder.props['aria-hidden']).toBe('true');
    expect(placeholder.props.tabIndex).toBe(-1);
    expect(placeholder.props.disabled).toBe(true);
    expect(popup.props.style.position).toBe('absolute');
    const [, yes, no] = popup.props.children;
    no.props.onClick();
    expect(state.set).toHaveBeenCalledWith(false);
    expect(onFreeze).toHaveBeenCalledWith(false);
    expect(onExit).not.toHaveBeenCalled();
    yes.props.onClick();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('keeps the existing inline confirmation for all other consumers', () => {
    state.confirming = true;
    const inline = ExitConfirmButton({ onExit: vi.fn(), style: {} });
    expect(inline.props.style.position).toBeUndefined();
    expect(inline.props.style.display).toBe('flex');
  });
});
