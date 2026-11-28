import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getLearnerId, isReturning, initAnalytics, track, trackFinal, beginGameAttempt, __resetForTests } from './analytics.js';

const LEARNER_KEY = 'playfood-learner';

const store = new Map();
beforeEach(() => {
  store.clear();
  __resetForTests();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  globalThis.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ tracking: true }) }));
});

describe('ταυτότητα', () => {
  it('φτιάχνει id 8 συμβόλων και το κρατά σταθερό', () => {
    const a = getLearnerId();
    expect(a).toMatch(/^[a-z0-9]{8}$/);
    expect(getLearnerId()).toBe(a);
  });

  it('πρώτη φορά = νέος, δεύτερη = επιστρέφων', () => {
    expect(isReturning()).toBe(false);
    getLearnerId();
    expect(isReturning()).toBe(true);
  });

  it('δεν αποθηκεύει τίποτα αναγνωριστικό', () => {
    getLearnerId();
    const dump = JSON.stringify([...store.entries()]);
    for (const forbidden of ['http', '@', 'Mozilla', '.']) {
      expect(dump.includes(forbidden)).toBe(false);
    }
  });

  it('τιμή κατεστραμμένη/ξένη στο storage ΔΕΝ μετράει ως επιστρέφων (ίδιος κανόνας εγκυρότητας)', () => {
    store.set(LEARNER_KEY, 'not-a-valid-id!!'); // δεν ταιριάζει στη μορφή [a-z0-9]{8}
    expect(isReturning()).toBe(false); // getLearnerId θα την αγνοήσει κι αυτή ούτως ή άλλως
    const id = getLearnerId();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(id).not.toBe('not-a-valid-id!!');
  });
});

describe('αποστολή', () => {
  it('creates a distinct attempt for each retry and sends its ID with the start', async () => {
    await initAnalytics('el');
    globalThis.fetch.mockClear();
    const first = beginGameAttempt({ island: 'growing', game: 'SoilDoctor' });
    const second = beginGameAttempt({ island: 'growing', game: 'SoilDoctor' });
    expect(first).toMatch(/^[a-z0-9]{20}$/);
    expect(second).not.toBe(first);
    expect(globalThis.fetch.mock.calls.map(([, request]) => JSON.parse(request.body).attempt_id)).toEqual([first, second]);
  });
  it('attaches the selected language to every game event', async () => {
    await initAnalytics('el');
    globalThis.fetch.mockClear();
    for (const type of ['hero_chosen', 'island_enter', 'game_start', 'game_finish', 'game_abandon']) {
      track(type);
    }
    expect(globalThis.fetch.mock.calls.map(([, request]) => JSON.parse(request.body).language))
      .toEqual(['el', 'el', 'el', 'el', 'el']);
  });

  it('reads language at dispatch time, including after delayed initialization', async () => {
    let language = null;
    let release;
    globalThis.fetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = initAnalytics(() => language);
    language = 'nl';
    release({ json: async () => ({ tracking: true }) });
    await pending;
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body).language).toBe('nl');
    language = 'pt';
    track('game_start');
    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body).language).toBe('pt');
  });

  it('keeps unknown language null instead of inventing English', async () => {
    await initAnalytics(() => null);
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body).language).toBeNull();
    track('game_start');
    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body).language).toBeNull();
  });

  it('includes the current language in the final beacon', async () => {
    let language = 'en';
    await initAnalytics(() => language);
    const beacon = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    try {
      language = 'el';
      trackFinal('session_end', { duration_s: 12 });
      expect(JSON.parse(await beacon.mock.calls[0][1].text()).language).toBe('el');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps sending events when the language reader fails or returns an unsupported value', async () => {
    let language = 'unsupported';
    await initAnalytics(() => {
      if (language === 'throw') throw new Error('unavailable');
      return language;
    });
    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body).language).toBeNull();
    language = 'throw';
    track('game_start');
    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body)).toMatchObject({ type: 'game_start', language: null });
  });

  it('δεν στέλνει τίποτα πριν το initAnalytics', () => {
    track('session_start');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('μετά από tracking:true στέλνει με το μυστικό', async () => {
    await initAnalytics();
    globalThis.fetch.mockClear();
    track('game_finish', { island: 'growing', game: 'SoilDoctor', score: 80, stars: 3 });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ev');
    expect(init.headers['x-pf-secret']).toBeDefined();
    const body = JSON.parse(init.body);
    expect(body.type).toBe('game_finish');
    expect(body.learner_id).toMatch(/^[a-z0-9]{8}$/);
    expect(body.ts).toBeUndefined();  // τη χρονοσήμανση τη βάζει ο server
  });

  it('με tracking:false δεν στέλνει ποτέ', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ tracking: false }) }));
    await initAnalytics();
    globalThis.fetch.mockClear();
    track('session_start');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('χωρίς server (στατική φιλοξενία) σιωπά αντί να σκάσει', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network')));
    await expect(initAnalytics()).resolves.toBe(false);
    globalThis.fetch.mockClear();
    expect(() => track('session_start')).not.toThrow();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('σφάλμα δικτύου στο track δεν ρίχνει εξαίρεση στο παιχνίδι, ΚΑΙ δεν αφήνει unhandled rejection', async () => {
    await initAnalytics();
    // ΣΚΟΠΙΜΑ ΟΧΙ vi.fn() εδώ: το tinyspy του vitest προσαρτά εσωτερικά δικό
    // του handler στο promise που επιστρέφει (για να γεμίσει το mock.results),
    // κι αυτό μόνο του αρκεί ώστε το Node να μην το θεωρήσει ποτέ "unhandled" —
    // δηλαδή ένα vi.fn() rejecting mock θα έκανε το τεστ πάντα πράσινο, ό,τι κι
    // αν κάνει το analytics.js. Με ένα απλό (μη-spy) function το βλέπουμε πραγματικά.
    globalThis.fetch = () => Promise.reject(new Error('boom'));

    // Δεν αρκεί να μη σκάσει συγχρονισμένα (track() απλά καλεί fetch() και επιστρέφει
    // αμέσως) — πρέπει να αποδείξουμε ότι το ΑΠΟΡΡΙΦΘΕΝ promise έχει πράγματι πιαστεί.
    // Αν το .catch(() => {}) στο analytics.js αφαιρεθεί, το παρακάτω listener θα το δει
    // (επαληθεύτηκε χειροκίνητα: αφαιρώντας το .catch, seen.length γίνεται 1).
    const unhandled = [];
    const onUnhandledRejection = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      expect(() => track('session_start')).not.toThrow();
      // Άδειασε την ουρά microtasks + αρκετά macrotasks ώστε το Node να προλάβει
      // να σημάνει "unhandled" αν όντως δεν υπάρχει κανένα .catch (ένα μόνο
      // setImmediate ΔΕΝ αρκεί — επαληθεύτηκε ότι το Node χρειάζεται τουλάχιστον
      // δύο macrotask γύρους πριν αναφέρει unhandledRejection).
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }

    expect(unhandled).toHaveLength(0);
  });
});

describe('ανθεκτικότητα (κρίσιμο: ποτέ exception προς το παιχνίδι)', () => {
  it('getLearnerId/isReturning δεν πετάνε ακόμα κι αν το storage σκάει ολοκληρωτικά', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
    };
    expect(() => isReturning()).not.toThrow();
    expect(isReturning()).toBe(false);

    let id;
    expect(() => { id = getLearnerId(); }).not.toThrow();
    expect(id).toMatch(/^[a-z0-9]{8}$/); // ζει μόνο στη μνήμη, αλλά έγκυρο
  });

  it('getLearnerId δεν πετάει ούτε αν το crypto λείπει/σκάει (Math.random fallback)', () => {
    const originalGetRandomValues = crypto.getRandomValues;
    crypto.getRandomValues = () => { throw new Error('no crypto here'); };
    try {
      let id;
      expect(() => { id = getLearnerId(); }).not.toThrow();
      expect(id).toMatch(/^[a-z0-9]{8}$/);
    } finally {
      crypto.getRandomValues = originalGetRandomValues;
    }
  });

  it('initAnalytics ΠΟΤΕ δεν απορρίπτεται όταν το storage πετάει (πριν ΚΑΙ μετά το await)', async () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
    };
    // Πριν το fix, isReturning() έτρεχε ΕΞΩ από το try και θα είχε ρίξει εδώ.
    await expect(initAnalytics()).resolves.toBe(true);
  });

  it('initAnalytics ΠΟΤΕ δεν απορρίπτεται όταν storage ΚΑΙ crypto σκάνε μαζί', async () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
    };
    const originalGetRandomValues = crypto.getRandomValues;
    crypto.getRandomValues = () => { throw new Error('no crypto here'); };
    try {
      // Πριν το fix, sessionId = rand(12) έτρεχε ΜΕΤΑ το try (μέσα στο if(enabled))
      // και θα είχε ρίξει εδώ, αφού tracking:true (βλ. beforeEach) ενεργοποιεί το κλαδί.
      await expect(initAnalytics()).resolves.toBe(true);
    } finally {
      crypto.getRandomValues = originalGetRandomValues;
    }
  });

  it('initAnalytics γυρνά false χωρίς να πετάει όταν ΤΑ ΠΑΝΤΑ είναι σπασμένα (storage+crypto+δίκτυο)', async () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
    };
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('no network either')));
    const originalGetRandomValues = crypto.getRandomValues;
    crypto.getRandomValues = () => { throw new Error('no crypto here'); };
    try {
      await expect(initAnalytics()).resolves.toBe(false);
    } finally {
      crypto.getRandomValues = originalGetRandomValues;
    }
  });
});

describe('τελευταία στιγμή (trackFinal)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('σιωπά πριν απαντήσει η ερώτηση (πριν το initAnalytics)', () => {
    vi.stubGlobal('navigator', { sendBeacon: vi.fn() });
    trackFinal('session_end');
    expect(globalThis.navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it('σιωπά όταν το tracking είναι απενεργοποιημένο', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ tracking: false }) }));
    await initAnalytics();
    vi.stubGlobal('navigator', { sendBeacon: vi.fn() });
    trackFinal('session_end');
    expect(globalThis.navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it('στέλνει με sendBeacon όταν είναι ενεργό, χωρίς χρονοσήμανση στο payload', async () => {
    await initAnalytics();
    vi.stubGlobal('navigator', { sendBeacon: vi.fn() });

    trackFinal('session_end', { island: 'growing' });

    expect(globalThis.navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = globalThis.navigator.sendBeacon.mock.calls[0];
    expect(url).toBe('/api/ev');
    const body = JSON.parse(await blob.text());
    expect(body.type).toBe('session_end');
    expect(body.learner_id).toMatch(/^[a-z0-9]{8}$/);
    expect(body.ts).toBeUndefined(); // τη χρονοσήμανση τη βάζει ο server
  });

  it('δεν πετάει όταν το sendBeacon λείπει εντελώς από το περιβάλλον', async () => {
    await initAnalytics();
    vi.stubGlobal('navigator', undefined); // π.χ. πολύ παλιός browser σε σχολικό εργαστήριο
    expect(() => trackFinal('session_end')).not.toThrow();
  });

  it('δεν πετάει όταν υπάρχει navigator αλλά χωρίς sendBeacon', async () => {
    await initAnalytics();
    vi.stubGlobal('navigator', {});
    expect(() => trackFinal('session_end')).not.toThrow();
  });
});

describe('ουρά κατά τη χειραψία (early events)', () => {
  /** initAnalytics που μένει "στον αέρα" μέχρι να καλέσουμε το release. */
  function pendingHandshake() {
    let release;
    globalThis.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ json: async () => ({ tracking: true }) });
    }));
    return () => release();
  }

  const sentTypes = () => globalThis.fetch.mock.calls
    .filter(([url]) => url === '/api/ev')
    .map(([, request]) => JSON.parse(request.body).type);

  it('δεν χάνει γεγονότα που εκπέμπονται όσο η χειραψία είναι σε εξέλιξη', async () => {
    const release = pendingHandshake();
    const pending = initAnalytics('el');
    track('hero_chosen');
    track('island_enter', { island: 'growing' });
    expect(sentTypes()).toEqual([]); // τίποτα πριν επιβεβαιωθεί το tracking
    release();
    await pending;
    expect(sentTypes()).toEqual(['session_start', 'hero_chosen', 'island_enter']);
  });

  it('κρατά τη γλώσσα της ΣΤΙΓΜΗΣ του γεγονότος, όχι της στιγμής αποστολής', async () => {
    let language = 'el';
    const release = pendingHandshake();
    const pending = initAnalytics(() => language);
    track('hero_chosen');
    language = 'nl';
    track('island_enter');
    language = 'pt';
    release();
    await pending;
    const languages = globalThis.fetch.mock.calls
      .filter(([url]) => url === '/api/ev')
      .map(([, request]) => JSON.parse(request.body))
      .filter((body) => body.type !== 'session_start')
      .map((body) => body.language);
    expect(languages).toEqual(['el', 'nl']);
  });

  it('πετάει την ουρά όταν ο server απαντήσει tracking:false', async () => {
    let release;
    globalThis.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ json: async () => ({ tracking: false }) });
    }));
    const pending = initAnalytics('el');
    track('hero_chosen');
    release();
    await pending;
    expect(sentTypes()).toEqual([]);
  });

  it('πετάει την ουρά χωρίς server (στατική φιλοξενία)', async () => {
    let reject;
    globalThis.fetch.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    const pending = initAnalytics('el');
    track('hero_chosen');
    reject(new Error('network'));
    await expect(pending).resolves.toBe(false);
    expect(sentTypes()).toEqual([]);
  });

  it('η ουρά είναι φραγμένη — δεν μεγαλώνει χωρίς όριο', async () => {
    const release = pendingHandshake();
    const pending = initAnalytics('el');
    for (let i = 0; i < 500; i++) track('island_enter', { index: i });
    release();
    await pending;
    const queued = sentTypes().filter((type) => type !== 'session_start');
    expect(queued.length).toBeLessThanOrEqual(50);
    expect(queued.length).toBeGreaterThan(0);
  });

  it('παράλληλες κλήσεις initAnalytics δεν διπλασιάζουν το session_start', async () => {
    const release = pendingHandshake();
    const first = initAnalytics('el');
    const second = initAnalytics('el');
    release();
    await Promise.all([first, second]);
    expect(sentTypes().filter((type) => type === 'session_start')).toHaveLength(1);
    expect(globalThis.fetch.mock.calls.filter(([url]) => url === '/api/config')).toHaveLength(1);
  });

  it('κρατά αντίγραφο των πεδίων — μεταβολή πριν το άδειασμα δεν αλλάζει το γεγονός', async () => {
    const release = pendingHandshake();
    const pending = initAnalytics('el');
    const fields = { island: 'growing', game: 'GardenPlanner' };
    track('game_start', fields);
    fields.island = 'circular';       // ο caller ξαναχρησιμοποιεί το ίδιο αντικείμενο
    fields.game = 'CircularCity';
    release();
    await pending;
    const sent = globalThis.fetch.mock.calls
      .filter(([url]) => url === '/api/ev')
      .map(([, request]) => JSON.parse(request.body))
      .find((body) => body.type === 'game_start');
    expect(sent.island).toBe('growing');
    expect(sent.game).toBe('GardenPlanner');
  });

  it('νέο init μηδενίζει την παλιά κατάσταση — γεγονός σε re-init με tracking:false δεν φεύγει', async () => {
    await initAnalytics('el');            // πρώτη χειραψία: tracking ενεργό
    globalThis.fetch.mockClear();
    let release;
    globalThis.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ json: async () => ({ tracking: false }) });
    }));
    const pending = initAnalytics('el');
    track('island_enter', { island: 'growing' });   // όσο τρέχει η δεύτερη χειραψία
    release();
    await pending;
    expect(sentTypes()).toEqual([]);
  });

  it('η ουρά αδειάζει μία φορά — δεύτερο init δεν ξαναστέλνει τα ίδια', async () => {
    const release = pendingHandshake();
    const pending = initAnalytics('el');
    track('hero_chosen');
    release();
    await pending;
    await initAnalytics('el');
    expect(sentTypes().filter((type) => type === 'hero_chosen')).toHaveLength(1);
  });
});

describe('trackFinal fallback', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('πέφτει σε keepalive fetch όταν το sendBeacon γυρνά false (π.χ. πολύ μεγάλο payload)', async () => {
    await initAnalytics('el');
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => false) });
    globalThis.fetch.mockClear();
    trackFinal('session_end', { duration_s: 12 });
    const [url, init] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toBe('/api/ev');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body).type).toBe('session_end');
  });

  it('πέφτει σε keepalive fetch όταν το sendBeacon πετάει', async () => {
    await initAnalytics('el');
    vi.stubGlobal('navigator', { sendBeacon: () => { throw new Error('blocked'); } });
    globalThis.fetch.mockClear();
    expect(() => trackFinal('session_end')).not.toThrow();
    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body).type).toBe('session_end');
  });

  it('πέφτει σε keepalive fetch όταν λείπει εντελώς το sendBeacon', async () => {
    await initAnalytics('el');
    vi.stubGlobal('navigator', {});
    globalThis.fetch.mockClear();
    trackFinal('session_end');
    expect(JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body).type).toBe('session_end');
  });

  it('δεν στέλνει fetch όταν το sendBeacon πέτυχε', async () => {
    await initAnalytics('el');
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => true) });
    globalThis.fetch.mockClear();
    trackFinal('session_end');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('το fallback δεν αφήνει unhandled rejection όταν σκάει και το δίκτυο', async () => {
    await initAnalytics('el');
    vi.stubGlobal('navigator', {});
    globalThis.fetch = () => Promise.reject(new Error('boom'));
    const unhandled = [];
    const onUnhandledRejection = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      expect(() => trackFinal('session_end')).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
    expect(unhandled).toHaveLength(0);
  });
});
