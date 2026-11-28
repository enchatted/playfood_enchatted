// Pure typewriter reveal for the Pokémon-style lighthouse dialogs.
//
// The canvas RAF loop holds no timers, so the revealed text is derived each
// frame from elapsed time × a chars-per-second rate. The reveal walks the
// (already-wrapped) lines left to right: line 1 fills before any of line 2
// shows, so multi-line keeper dialogs and the 2-line compass bubble both type
// out naturally.

/**
 * @param {string[]} lines    already-wrapped text lines
 * @param {number}   elapsedSec seconds since the dialog opened
 * @param {number}   cps        characters revealed per second
 * @returns {{ lines: string[], done: boolean }}
 *          per-line revealed substrings + whether the whole text is shown.
 */
export function typewriterLines(lines, elapsedSec, cps) {
  const safe = Array.isArray(lines) ? lines.map((l) => (l == null ? '' : String(l))) : [];
  const total = safe.reduce((n, l) => n + l.length, 0);
  const revealed = Math.max(0, Math.floor((elapsedSec || 0) * (cps || 0)));

  let budget = revealed;
  const out = safe.map((line) => {
    if (budget <= 0) return '';
    if (budget >= line.length) {
      budget -= line.length;
      return line;
    }
    const shown = line.slice(0, budget);
    budget = 0;
    return shown;
  });

  return { lines: out, done: revealed >= total };
}
