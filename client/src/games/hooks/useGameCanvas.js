import { useState, useRef, useEffect, useCallback } from 'react';
import { attachHiDPI, beginFrame } from '../../utils/hidpi.js';
import { CANVAS_W, CANVAS_H } from '../../overworld/overworldData.js';
import { useRegisterActiveCanvas } from '../../components/ActiveCanvasStage.jsx';
import useEscapePause from './useEscapePause.js';

/**
 * useGameCanvas — Shared game loop hook (Section 8.2)
 *
 * @param {React.RefObject} canvasRef - ref to <canvas> element
 * @param {Object} config
 * @param {Function} config.setup    - (gameObjects) => void — initialize game objects
 * @param {Function} config.update   - (gameObjects, deltaTime, helpers) => void — update logic
 * @param {Function} config.render   - (ctx, gameObjects, helpers) => void — draw frame
 * @param {Function} config.onComplete - (finalScore) => void — called when game ends
 *
 * @returns {{ gameState, setGameState, score, setScore, gameObjects, timeLeft, setTimeLeft }}
 */
export default function useGameCanvas(canvasRef, config) {
  useRegisterActiveCanvas(canvasRef);
  const [gameState, setGameState] = useState('INIT');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.timeLimit ?? null);
  const gameObjects = useRef([]);
  const scoreRef = useRef(0);
  const timeRef = useRef(config.timeLimit ?? null);
  const gameStateRef = useRef('INIT');

  useEscapePause(gameStateRef, setGameState, {
    isBlocked: () => gameObjects.current[0]?.exitConfirmOpen === true,
  });

  // Keep refs in sync
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

    // Setup
    config.setup(gameObjects.current);

    const helpers = {
      getScore: () => scoreRef.current,
      setScore: (s) => { scoreRef.current = s; setScore(s); },
      addScore: (amount) => {
        const next = scoreRef.current + amount;
        scoreRef.current = next;
        setScore(next);
      },
      getTimeLeft: () => timeRef.current,
      getGameState: () => gameStateRef.current,
      complete: () => setGameState('COMPLETED'),
    };

    function loop(timestamp) {
      const deltaTime = lastTime ? (timestamp - lastTime) / 1000 : 0;
      lastTime = timestamp;

      if (gameStateRef.current === 'PLAYING') {
        // Update timer (skip if game signals timerPaused via gameObjects[0])
        if (timeRef.current != null && !gameObjects.current[0]?.timerPaused) {
          const next = Math.max(0, timeRef.current - deltaTime);
          timeRef.current = next;
          setTimeLeft(next);
          if (next <= 0) {
            setGameState('COMPLETED');
            if (config.onComplete) config.onComplete(scoreRef.current);
            return;
          }
        }

        config.update(gameObjects.current, deltaTime, helpers);

        beginFrame(ctx, canvas);
        config.render(ctx, gameObjects.current, helpers);
      }

      animationId = requestAnimationFrame(loop);
    }

    animationId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animationId);
      detachHiDPI();
    };
  }, [gameState === 'INIT']); // Re-run only on init

  return { gameState, setGameState, score, setScore, gameObjects, timeLeft, setTimeLeft };
}
