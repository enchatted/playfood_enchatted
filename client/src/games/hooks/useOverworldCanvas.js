import { useRef, useEffect } from 'react';
import { keyBelongsToDomTarget } from '../../utils/keyOwnership.js';
import { attachHiDPI, beginFrame } from '../../utils/hidpi.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { useRegisterActiveCanvas } from '../../components/ActiveCanvasStage.jsx';

/**
 * useOverworldCanvas — RAF loop for the overworld map.
 * Stripped-down variant of useGameCanvas: no timer, no score, no state machine.
 * All state lives in refs to avoid React re-renders during gameplay.
 *
 * @param {React.RefObject} canvasRef
 * @param {Object} config
 * @param {Function} config.setup  - (state) => void
 * @param {Function} config.update - (state, dt, keys) => void
 * @param {Function} config.render - (ctx, state) => void
 */
export default function useOverworldCanvas(canvasRef, config) {
  useRegisterActiveCanvas(canvasRef);
  const stateRef = useRef({});
  const keysRef = useRef(new Set());
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const detachHiDPI = attachHiDPI(canvas, CANVAS_W, CANVAS_H);
    let lastTime = 0;
    let animationId;

    const onKeyDown = (e) => {
      if (keyBelongsToDomTarget(e)) return; // a focused button/input owns this key
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault(); // on EVERY event, repeats included - never let Space scroll
      }
      // Ignore OS auto-repeat past this point: the original keydown already put
      // the key in the Set, and a repeat must never re-introduce a key held down
      // since BEFORE this screen mounted (that race let a held Enter skip cards).
      if (e.repeat) return;
      keysRef.current.add(e.key.toLowerCase());
      // Also track physical key position so WASD works across keyboard layouts
      // (Greek, Cyrillic, etc.) where e.key returns the localized character.
      if (e.code) keysRef.current.add(e.code.toLowerCase());
    };
    const onKeyUp = (e) => {
      keysRef.current.delete(e.key.toLowerCase());
      if (e.code) keysRef.current.delete(e.code.toLowerCase());
    };

    // Clear all held keys when the window loses focus (opening a source page in
    // a new tab, alt-tab): otherwise the keyup never arrives and the key stays
    // "held" in the Set until it is pressed and released again.
    const onBlur = () => keysRef.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    configRef.current.setup(stateRef.current);

    function loop(timestamp) {
      const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 0;
      lastTime = timestamp;

      configRef.current.update(stateRef.current, dt, keysRef.current);

      beginFrame(ctx, canvas);
      configRef.current.render(ctx, stateRef.current);

      animationId = requestAnimationFrame(loop);
    }

    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      detachHiDPI();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return { stateRef, keysRef };
}
