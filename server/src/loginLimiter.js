// Staff login: ten attempts per five minutes, including successful attempts.
// Buckets live only in this server instance and expire automatically on use.
export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 5 * 60 * 1000;
export const LOGIN_MAX_PEERS = 5000;

export function createLoginLimiter({ maxAttempts = LOGIN_MAX_ATTEMPTS,
  windowMs = LOGIN_WINDOW_MS, maxPeers = LOGIN_MAX_PEERS, now = () => Date.now() } = {}) {
  const attempts = new Map();
  let nextExpiry = Infinity;

  // Returns zero when allowed, otherwise the Retry-After value in seconds.
  return (peer) => {
    const currentTime = now();
    if (currentTime >= nextExpiry) {
      nextExpiry = Infinity;
      for (const [key, entry] of attempts) {
        if (currentTime >= entry.expiresAt) attempts.delete(key);
        else nextExpiry = Math.min(nextExpiry, entry.expiresAt);
      }
    }

    let entry = attempts.get(peer);
    if (!entry) {
      // Do not evict active buckets: cycling addresses must not clear a block.
      if (attempts.size >= maxPeers) return Math.max(1, Math.ceil((nextExpiry - currentTime) / 1000));
      entry = { count: 0, expiresAt: currentTime + windowMs };
      attempts.set(peer, entry);
      nextExpiry = Math.min(nextExpiry, entry.expiresAt);
    }
    if (entry.count >= maxAttempts) return Math.max(1, Math.ceil((entry.expiresAt - currentTime) / 1000));
    entry.count += 1;
    return 0;
  };
}
