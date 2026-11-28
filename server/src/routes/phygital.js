import { readFileSync, statSync } from 'node:fs';

const ID = /^[A-Z][A-Z0-9_]{0,31}$/;
const CODE = /^[A-Z0-9_-]{3,32}$/;
const ISLANDS = new Set(['growing', 'local', 'foodwaste', 'circular']);

export default async function phygitalRoutes(app, { file }) {
  let current = null;
  let previousRaw;
  let previousError;

  // Read at redemption time: atomic replacement of the file needs no restart.
  function reload() {
    try {
      if (statSync(file).size > 65536) throw new Error('configuration exceeds 64 KB');
      const raw = readFileSync(file, 'utf8');
      if (raw === previousRaw) return;
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries) || entries.length > 100) throw new Error('expected up to 100 activities');
      const ids = new Set();
      const codes = new Map();
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') throw new Error('invalid activity');
        const { id, code, points, island, enabled } = entry;
        if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) throw new Error('invalid or duplicate activity id');
        if (typeof code !== 'string' || !CODE.test(code) || codes.has(code)) throw new Error('invalid or duplicate activity code');
        if (!Number.isInteger(points) || points < 0 || points > 1000) throw new Error('points must be an integer from 0 to 1000');
        if (!ISLANDS.has(island) || typeof enabled !== 'boolean') throw new Error('invalid island or enabled setting');
        const description = entry.description ?? {};
        if (!description || typeof description !== 'object' || Array.isArray(description)
          || Object.entries(description).some(([language, text]) => !['en', 'el', 'nl', 'pt'].includes(language)
            || typeof text !== 'string' || text.length > 240)) throw new Error('invalid activity description');
        ids.add(id);
        codes.set(code, { id, points, island, enabled, description });
      }
      current = codes;
      previousRaw = raw;
      previousError = undefined;
    } catch (error) {
      const message = error.code || error.message;
      if (message !== previousError) app.log.error(`Phygital configuration rejected (${message}); keeping last valid configuration, or disabling redemption if none exists.`);
      previousError = message;
    }
  }

  // Establish a fallback immediately, even before the first redemption.
  reload();
  app.post('/phygital/redeem', { bodyLimit: 8192 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { code, redeemedIds = [], language = 'en' } = request.body || {};
    if (typeof code !== 'string' || code.length > 64 || !Array.isArray(redeemedIds)
      || redeemedIds.length > 100 || redeemedIds.some(id => typeof id !== 'string' || !ID.test(id))) {
      return reply.code(400).send({ success: false, reason: 'invalid_code' });
    }
    reload();
    if (!current) return reply.code(503).send({ success: false, reason: 'unavailable' });
    const reward = current.get(code.trim().toUpperCase());
    if (!reward?.enabled) return reply.code(400).send({ success: false, reason: 'invalid_code' });
    if (redeemedIds.includes(reward.id)) return reply.code(409).send({ success: false, reason: 'already_redeemed' });
    if (redeemedIds.length >= 100) return reply.code(409).send({ success: false, reason: 'limit_reached' });
    const locale = ['en', 'el', 'nl', 'pt'].includes(language) ? language : 'en';
    return { success: true, id: reward.id, points: reward.points, island: reward.island,
      description: reward.description[locale] || reward.description.en || '' };
  });
}
