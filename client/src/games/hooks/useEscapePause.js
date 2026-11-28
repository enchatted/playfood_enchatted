import { useEffect, useRef } from 'react';
import { keyBelongsToDomTarget } from '../../utils/keyOwnership.js';

export function getEscapePauseTarget(gameState, blocked = false) {
  if (blocked) return null;
  if (gameState === 'PLAYING') return 'PAUSED';
  if (gameState === 'PAUSED') return 'PLAYING';
  return null;
}

/** Give Escape one consistent meaning while a mini-game owns the screen. */
export default function useEscapePause(gameStateRef, setGameState, options = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || keyBelongsToDomTarget(event)) return;

      const currentOptions = optionsRef.current;
      if (currentOptions.onEscape?.() === true) {
        event.preventDefault();
        event.stopImmediatePropagation();
        currentOptions.keysRef?.current?.clear();
        return;
      }
      const blocked = currentOptions.isBlocked?.() === true;
      const nextState = getEscapePauseTarget(gameStateRef.current, blocked);
      if (!nextState) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      currentOptions.keysRef?.current?.clear();
      setGameState(nextState);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [gameStateRef, setGameState]);
}
