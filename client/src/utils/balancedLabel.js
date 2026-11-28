/**
 * Keeps single-word labels intact and balances every multi-word island name
 * over two lines. A single long word is never split in the middle.
 */
export function balanceTwoLineLabel(label) {
  const normalized = String(label || '').trim().replace(/\s+/g, ' ');
  const words = normalized.split(' ').filter(Boolean);

  if (words.length < 2) {
    return normalized ? [normalized] : [];
  }

  let best = null;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(' ');
    const second = words.slice(index).join(' ');
    const score = Math.max([...first].length, [...second].length);
    const imbalance = Math.abs([...first].length - [...second].length);

    if (!best || score < best.score || (score === best.score && imbalance < best.imbalance)) {
      best = { lines: [first, second], score, imbalance };
    }
  }

  return best?.lines || [normalized];
}
