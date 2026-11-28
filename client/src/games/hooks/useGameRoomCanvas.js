import { useState, useRef, useEffect, useContext, useLayoutEffect } from 'react';
import { GameProgressContext } from '../../utils/gameProgress.js';
import { gameTimingPhase } from '../../utils/gameTiming.js';
import { keyBelongsToDomTarget } from '../../utils/keyOwnership.js';
import { attachHiDPI, beginFrame } from '../../utils/hidpi.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { useRegisterActiveCanvas } from '../../components/ActiveCanvasStage.jsx';
import useEscapePause from './useEscapePause.js';

/**
 * useGameRoomCanvas — Combines keyboard input (useOverworldCanvas) with
 * timer/score/state machine (useGameCanvas) for walk-around game rooms.
 *
 * @param {React.RefObject} canvasRef
 * @param {Object} config
 * @param {number}   config.timeLimit  - seconds (null = no timer)
 * @param {Function} config.setup      - (state) => void
 * @param {Function} config.update     - (state, dt, keys, helpers) => void
 * @param {Function} config.render     - (ctx, state, helpers) => void
 * @param {Function} config.onComplete - (finalScore) => void
 *
 * @returns {{ gameState, setGameState, score, setScore, timeLeft, stateRef, keysRef }}
 */
export default function useGameRoomCanvas(canvasRef, config) {
  useRegisterActiveCanvas(canvasRef);
  const [gameState, setGameState] = useState('INIT');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.timeLimit ?? null);

  const stateRef = useRef({});
  const keysRef = useRef(new Set());
  const scoreRef = useRef(0);
  const timeRef = useRef(config.timeLimit ?? null);
  const gameStateRef = useRef('INIT');
  const configRef = useRef(config);
  configRef.current = config;
  const progressSource = useContext(GameProgressContext);

  useLayoutEffect(() => {
    if (!progressSource) return;
    // Retain the last state through unmount so the parent can read it on exit.
    progressSource.current = {
      get state() { return stateRef.current; },
      get completed() { return gameStateRef.current === 'COMPLETED'; },
      get timingPhase() { return gameTimingPhase(progressSource.mission, gameStateRef.current, stateRef.current); },
    };
  }, [progressSource]);

  useEscapePause(gameStateRef, setGameState, {
    keysRef,
    onEscape: () => !stateRef.current.exitConfirmOpen && gameStateRef.current === 'PLAYING'
      && configRef.current.onEscape?.(stateRef.current) === true,
    isBlocked: () => stateRef.current.exitConfirmOpen === true,
  });

  // Keep refs in sync with React state
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { timeRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const detachHiDPI = attachHiDPI(canvas, CANVAS_W, CANVAS_H);
    let lastTime = 0;
    let animationId;

    // Keyboard input
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
      // Layout-independent fallback (KeyW etc.) for WASD on non-Latin keyboards.
      if (e.code) keysRef.current.add(e.code.toLowerCase());
    };
    const onKeyUp = (e) => {
      keysRef.current.delete(e.key.toLowerCase());
      if (e.code) keysRef.current.delete(e.code.toLowerCase());
    };
    // Clear all held keys when the window loses focus (e.g. opening a source page
    // in a new tab via S). Otherwise the keyup never arrives and the avatar would
    // keep "walking" on its own when focus returns.
    const onBlur = () => keysRef.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // Setup
    configRef.current.setup(stateRef.current);

    // Helpers (same API as useGameCanvas)
    const helpers = {
      getScore: () => scoreRef.current,
      setScore: (s) => { scoreRef.current = s; setScore(s); },
      addScore: (amount) => {
        // Games floor the score at 0 by default; a game can opt into honest
        // negative scoring (so penalties stay visible even at 0) via config.
        const floor = configRef.current.allowNegativeScore ? Number.NEGATIVE_INFINITY : 0;
        const next = Math.max(floor, scoreRef.current + amount);
        scoreRef.current = next;
        setScore(next);
      },
      getTimeLeft: () => timeRef.current,
      getGameState: () => gameStateRef.current,
      complete: () => { gameStateRef.current = 'COMPLETED'; setGameState('COMPLETED'); },
    };

    function loop(timestamp) {
      const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : 0;
      lastTime = timestamp;

      if (gameStateRef.current === 'PLAYING') {
        // A header modal (the exit mini-confirm) freezes both the timer and the
        // game logic while it is open — the scene still renders behind it.
        const frozen = stateRef.current.exitConfirmOpen === true;

        // Timer countdown (skip if game signals timerPaused, or a modal froze play)
        if (!frozen && timeRef.current != null && !stateRef.current.timerPaused) {
          const next = Math.max(0, timeRef.current - dt);
          timeRef.current = next;
          setTimeLeft(next);
          if (next <= 0) {
            gameStateRef.current = 'COMPLETED';
            setGameState('COMPLETED');
            if (configRef.current.onComplete) configRef.current.onComplete(scoreRef.current);
            return;
          }
        }

        if (!frozen) configRef.current.update(stateRef.current, dt, keysRef.current, helpers);
      }

      beginFrame(ctx, canvas);
      configRef.current.render(ctx, stateRef.current, helpers);

      animationId = requestAnimationFrame(loop);
    }

    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      detachHiDPI();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keysRef.current.clear();
    };
  }, [gameState === 'INIT']);

  // Re-focus the canvas whenever play (re)starts — esp. after Pause → Resume, where
  // focus otherwise lands on <body> and canvas-level handlers (e.g. the S source key)
  // would silently stop responding.
  useEffect(() => {
    if (gameState === 'PLAYING') canvasRef.current?.focus();
  }, [gameState]);

  return { gameState, setGameState, score, setScore, timeLeft, setTimeLeft, stateRef, keysRef };
}
