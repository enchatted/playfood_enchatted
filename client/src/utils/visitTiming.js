import { trackFinal } from './analytics.js';

// Elapsed page lifetime, NOT active gameplay. Hidden/idle/reading time remains
// included. A missing final event means unknown duration, not a zero-length visit.
export function watchVisitTiming({ target = window, now = Date.now, send = trackFinal } = {}) {
  const startedAt = now();
  let ended = false;
  const onLeave = (event) => {
    // A cached page may resume the same analytics session on pageshow.
    if (event.persisted || ended) return;
    ended = true;
    send('session_end', { duration_s: Math.max(0, Math.round((now() - startedAt) / 1000)) });
  };
  target.addEventListener('pagehide', onLeave);
  return () => target.removeEventListener('pagehide', onLeave);
}
