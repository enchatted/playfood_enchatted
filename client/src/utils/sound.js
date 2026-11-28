// Synthesized game sounds (C3) — zero assets, pure WebAudio blips so school
// laptops load nothing extra. Four lightweight sounds are available:
//   pickup        — grabbing an item (wired per game)
//   success       — spawnSparkles call sites (engine-wide)
//   wrong         — spawnRejectX call sites (engine-wide)
//   win           — legacy fallback; major results now use licensed audio cues
// Browsers keep AudioContext suspended until a user gesture, so the module
// unlocks itself on the first keydown/pointerdown. Every call is try/catch
// no-op safe (tests run in node where AudioContext doesn't exist).

const MASTER_VOLUME = 0.16;     // quiet by default — classroom setting
const COOLDOWN_MS = 90;         // per-sound throttle (sparkles can burst-fire)

let ctx = null;
let unlocked = false;
const lastPlayed = {};
const enabledSubscribers = new Set();

export const SOUND_LEVELS = [25, 50, 100];

function readPreference(key) {
  try { return globalThis.window?.localStorage.getItem(key); }
  catch { return null; }
}

function savePreference(key, value) {
  try { globalThis.window?.localStorage.setItem(key, value); }
  catch { /* Memory preference still works when browser storage is unavailable. */ }
}

let enabled = readPreference('playfood-sound') !== 'off';
const savedLevel = Number(readPreference('playfood-volume'));
let level = SOUND_LEVELS.includes(savedLevel) ? savedLevel : 100;
let outputGain = null;

export function getSoundLevel() {
  return enabled ? level : 0;
}

export function setSoundEnabled(on) {
  enabled = Boolean(on);
  savePreference('playfood-sound', enabled ? 'on' : 'off');
  if (outputGain) outputGain.gain.value = getSoundLevel() / 100;
  for (const subscriber of enabledSubscribers) subscriber(enabled);
}

export function setSoundLevel(value) {
  if (!SOUND_LEVELS.includes(value)) return;
  level = value;
  savePreference('playfood-volume', String(value));
  setSoundEnabled(true);
}

export function isSoundEnabled() {
  return enabled;
}

export function subscribeSoundEnabled(subscriber) {
  enabledSubscribers.add(subscriber);
  return () => enabledSubscribers.delete(subscriber);
}

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    outputGain = ctx.createGain();
    outputGain.gain.value = getSoundLevel() / 100;
    outputGain.connect(ctx.destination);
    // One-time unlock: resume inside a real user gesture handler
    const unlock = () => {
      ctx.resume().catch(() => {});
      unlocked = true;
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }
  return ctx;
}

// One enveloped oscillator note.
function note(ac, { freq, start, dur, type = 'triangle', vol = 1, slideTo = null }) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  const t0 = ac.currentTime + start;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(MASTER_VOLUME * vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(outputGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  pickup: (ac) => {
    note(ac, { freq: 440, start: 0, dur: 0.09, type: 'square', vol: 0.6, slideTo: 660 });
  },
  success: (ac) => {
    note(ac, { freq: 523, start: 0, dur: 0.12 });
    note(ac, { freq: 784, start: 0.09, dur: 0.16 });
  },
  wrong: (ac) => {
    note(ac, { freq: 220, start: 0, dur: 0.16, type: 'square', vol: 0.7, slideTo: 150 });
  },
  win: (ac) => {
    [523, 659, 784, 1046].forEach((f, i) => {
      note(ac, { freq: f, start: i * 0.11, dur: i === 3 ? 0.4 : 0.14 });
    });
  },
};

export function playSound(name) {
  if (!enabled || !SOUNDS[name]) return;
  try {
    const ac = getCtx();
    if (!ac || (ac.state === 'suspended' && !unlocked)) return;
    const now = Date.now();
    if (lastPlayed[name] && now - lastPlayed[name] < COOLDOWN_MS) return;
    lastPlayed[name] = now;
    SOUNDS[name](ac);
  } catch { /* never let audio break the game */ }
}
