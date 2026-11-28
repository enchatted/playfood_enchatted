// Process-local counters, scoped to the installation database. No identifiers or payloads.
const counters = new WeakMap();

export function collectionDiagnostics(db) {
  if (!counters.has(db)) counters.set(db, { since: Date.now(), accepted: 0,
    lastAcceptedAt: null, unauthorized: 0, invalid: 0, rateLimited: 0, dailyCap: 0 });
  return counters.get(db);
}
