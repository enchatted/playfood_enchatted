// Ο έλεγχος Node-έκδοσης ζει ΜΟΝΟ στο server.js (entry point), όχι εδώ: τα
// static imports ενός module αξιολογούνται όλα ΠΡΙΝ από οποιαδήποτε δική του
// top-level δήλωση, όποια θέση κι αν έχουν στο κείμενο. Μέχρι να προλάβει να
// τρέξει ένας έλεγχος εδώ, το better-sqlite3 (import πιο κάτω) θα έχει ήδη
// φορτωθεί — ή αποτύχει. Το engines.node στο package.json (npm engine-strict)
// καλύπτει την εγκατάσταση.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startConfigWatcher, stopConfigWatcher, getConfig } from './config.js';
import { openDb, purgeOlderThan } from './db.js';
import { sealUsersFile, stopSessionSweeper } from './auth.js';
import ingestRoutes from './routes/ingest.js';
import panelApiRoutes from './routes/panelApi.js';
import phygitalRoutes from './routes/phygital.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(HERE, '..');

export async function buildServer({ dataDir = SERVER_ROOT, clientDist = join(SERVER_ROOT, '../client/dist'),
  loggerLevel, trustProxy, corsOrigins } = {}) {
  // @fastify/static δεν πετάει σφάλμα όταν λείπει ο φάκελος-ρίζα — απλώς
  // καταγράφει προειδοποίηση, και σε παραγωγή το logger level είναι 'error'
  // οπότε αυτή η προειδοποίηση εξαφανίζεται εντελώς. Αποτέλεσμα: κάθε σελίδα
  // θα γύριζε 404 χωρίς κανένα ίχνος στα logs. Ελέγχουμε ρητά εδώ, ΠΡΙΝ από
  // οποιαδήποτε άλλη ενέργεια (config watcher, seal του users.txt, άνοιγμα
  // βάσης) — άσκοπο να ξεκινήσει server που δεν μπορεί να σερβίρει τίποτα.
  if (!existsSync(clientDist)) {
    throw new Error(
      `game build not found at ${clientDist} — run "npm run build" inside client/ ` +
      `(or "npm --prefix client run build" from the repo root) before starting the server`
    );
  }

  const configFile = join(dataDir, 'playfood.config.txt');
  const usersFile = join(dataDir, 'users.txt');
  const dbFile = join(dataDir, 'playfood.db');

  startConfigWatcher(configFile);                 // επαναφόρτωση ανά 30″
  process.env.TZ = getConfig().TIMEZONE;          // ορίζει τι σημαίνει «σήμερα»

  sealUsersFile(usersFile);                       // αυτο-κλείδωμα καθαρών κωδικών

  const db = openDb(dbFile);
  purgeOlderThan(db, getConfig().RETENTION_MONTHS);
  const purgeTimer = setInterval(
    () => purgeOlderThan(db, getConfig().RETENTION_MONTHS), 24 * 3600 * 1000);
  purgeTimer.unref?.();

  const fastify = Fastify({
    logger: {
      level: loggerLevel ?? (process.env.NODE_ENV === 'production' ? 'error' : 'info'),
      serializers: { req: () => ({}) },  // Ποτέ metadata αιτήματος (IP, headers) — GDPR/παιδιά
    },
    bodyLimit: 32768,
    trustProxy: trustProxy ?? getConfig().TRUST_PROXY,
  });

  // Same-origin game/panel need no CORS grant. Separate hosted origins must be named.
  const allowedOrigins = corsOrigins ?? getConfig().CORS_ORIGINS;
  await fastify.register(cors, { origin: allowedOrigins.length ? allowedOrigins : false });

  await fastify.register(ingestRoutes, { db, prefix: '/api' });
  await fastify.register(phygitalRoutes, { file: join(dataDir, 'phygital-codes.json'), prefix: '/api' });
  await fastify.register(panelApiRoutes, { db, usersFile, dbFile, prefix: '/api' });

  // Το panel: αυτόνομη στατική σελίδα, εκτός React
  const panelRoot = join(HERE, '../public/panel');
  await fastify.register(fastifyStatic, {
    root: panelRoot,
    prefix: '/panel/',
    decorateReply: false,
  });
  // reply.sendFile ΕΙΝΑΙ decorated από την ΕΠΟΜΕΝΗ εγγραφή (το παιχνίδι, root:
  // clientDist) — χωρίς ρητό δεύτερο όρισμα εδώ θα εξυπηρετούσε σιωπηλά το
  // index.html ΤΟΥ ΠΑΙΧΝΙΔΙΟΥ στο /panel (χωρίς κάθετο), αφού ο decorator
  // χρησιμοποιεί το root ΤΟΥ ΔΙΚΟΥ ΤΟΥ plugin ως προεπιλογή. Αποδείχθηκε με
  // εκτέλεση: χωρίς το panelRoot εδώ, GET /panel επέστρεφε "<h1>GAME</h1>".
  fastify.get('/panel', (request, reply) => reply.sendFile
    ? reply.sendFile('index.html', panelRoot)
    : reply.redirect('/panel/'));

  // Το παιχνίδι
  await fastify.register(fastifyStatic, {
    root: clientDist,
    prefix: '/',
    decorateReply: true,
  });
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
    const pathname = decodeURIComponent(request.url.split('?')[0]);
    // Only page navigation gets the SPA fallback. Missing files and reserved
    // static directories must report 404 so broken resources stay detectable.
    if (!['GET', 'HEAD'].includes(request.method) || extname(pathname) ||
        pathname === '/assets' || pathname.startsWith('/assets/') || pathname.startsWith('/panel/')) {
      return reply.code(404).send({ error: 'not found' });
    }
    // Ρητό root — ακριβώς το ίδιο ζήτημα που έσπασε το /panel: χωρίς δεύτερο
    // όρισμα το sendFile ακολουθεί το root ΟΠΟΙΑΣΔΗΠΟΤΕ εγγραφής έτυχε να το
    // decorate-άρει τελευταία, όχι απαραίτητα του παιχνιδιού.
    return reply.sendFile('index.html', clientDist);   // SPA fallback
  });

  fastify.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    stopConfigWatcher();
    stopSessionSweeper();
    db.close();
  });
  return fastify;
}

// Χρησιμοποιείται από το server.js μετά το buildServer() — δεν διαβάζει το
// config στο import-time, ώστε να αντανακλά πάντα την τρέχουσα τιμή.
export const getPort = () => getConfig().PORT;
