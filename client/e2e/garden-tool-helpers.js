// Position the avatar beside a tool, then use real key presses or touch input to interact with it.
import { pressEnter } from './helpers.js';

export const BASKET_FACE = { col: 17, row: 7, dir: 3 };  // facing the basket (18,7)
export const BIN_FACE = { col: 17, row: 9, dir: 3 };     // facing the bin (18,9)
export const TIE_STANCES = [{ col: 17, row: 8, dir: 3 }, { col: 18, row: 8, dir: 2 }];
export const WILTED_FACE = { col: 3, row: 1, dir: 0 };   // facing the wilted plot (3,2)
export const HEALTHY_FACE = { col: 4, row: 1, dir: 0 };  // facing the healthy plot (4,2)

/** Canvas recorder: texts (with font), halo arcs, so availability can be read off the frame. */
export async function installGardenRecorder(page) {
  await page.addInitScript(() => {
    window.__t = []; window.__a = []; window.__rec = false;
    const P = CanvasRenderingContext2D.prototype;
    const oT = P.fillText;
    P.fillText = function f(s, x, y, ...r) {
      if (window.__rec) {
        const m = this.getTransform(); const mt = this.measureText(String(s));
        window.__t.push({ s: String(s), font: this.font, x: m.a * x + m.e, y: m.d * y + m.f,
          l: m.a * (x - mt.actualBoundingBoxLeft) + m.e, r: m.a * (x + mt.actualBoundingBoxRight) + m.e,
          top: m.d * (y - mt.actualBoundingBoxAscent) + m.f, bot: m.d * (y + mt.actualBoundingBoxDescent) + m.f,
          cw: this.canvas.width, ch: this.canvas.height });
      }
      return oT.call(this, s, x, y, ...r);
    };
    const oA = P.arc;
    P.arc = function a(x, y, rad, ...r) {
      if (window.__rec) { const m = this.getTransform(); window.__a.push({ x: m.a * x + m.e, y: m.d * y + m.f, rad, stroke: String(this.strokeStyle) }); }
      return oA.call(this, x, y, rad, ...r);
    };
  });
}

export async function frame(page) {
  await page.evaluate(() => { window.__t = []; window.__a = []; window.__rec = true; });
  await page.waitForTimeout(200);
  return page.evaluate(() => { window.__rec = false; return { t: window.__t, a: window.__a }; });
}

/** The step banner may wrap (12/10): find its consecutive lines (same font) whose
 *  text, joined, is the whole expected text. Returns the drawn lines or null. */
export function drawnLines(fr, text) {
  const norm = (v) => v.replace(/\s+/g, ' ').trim();
  const want = norm(text);
  for (let i = 0; i < fr.t.length; i++) {
    let acc = '';
    for (let j = i; j < fr.t.length && fr.t[j].font === fr.t[i].font; j++) {
      acc = norm(acc ? `${acc} ${fr.t[j].s}` : fr.t[j].s);
      if (!want.startsWith(acc)) break;
      if (acc === want) return fr.t.slice(i, j + 1);
    }
  }
  return null;
}

export const gs = (page) => page.evaluate(() => {
  const s = document.querySelector('canvas')._stateRef.current;
  return {
    carrying: s.carrying?.tool || (s.carrying?.seed ? 'seed' : null),
    prompt: s.actionPrompt, target: s.targetTile ? { col: s.targetTile.col, row: s.targetTile.row } : null,
    tie: s.toolTieHint, toast: s.feedbackText, phase: s.phase,
    healthyHarvests: s.healthyHarvests, wrongToolCount: s.wrongToolCount,
    harvested: s.plots.map((p) => !!p.harvested).join(''),
    screen: window.__playfood.state().currentScreen,
  };
});

export async function dismissIntro(page) {
  await page.waitForTimeout(650);
  await pressEnter(page);
  await page.waitForFunction(() => {
    const s = document.querySelector('canvas')?._stateRef?.current;
    return s && !s.showMissionIntro && s.irisOpenness >= 1;
  });
}

/** HARVEST with one wilted (3,2) and one healthy (4,2) plant left; the rest harvested. */
export async function mixedHarvest(page, carrying = null) {
  await page.evaluate((c) => {
    const s = document.querySelector('canvas')._stateRef.current;
    Object.assign(s, { phase: 'HARVEST', carrying: c ? { tool: c } : null, decisionEvent: null, pendingEvent: null, wrongToolCount: 0, healthyHarvests: 0 });
    for (const p of s.plots) Object.assign(p, { seed: { id: 'cabbage', emoji: '🥬' }, health: 2, wilted: false, harvested: true });
    Object.assign(s.plots.find((p) => p.col === 3 && p.row === 2), { health: 0, wilted: true, harvested: false });
    Object.assign(s.plots.find((p) => p.col === 4 && p.row === 2), { health: 2, wilted: false, harvested: false });
  }, carrying);
  await page.waitForTimeout(150);
}

export async function place(page, st) {
  await page.evaluate((p) => {
    const pl = document.querySelector('canvas')._stateRef.current.player;
    Object.assign(pl, { col: p.col, row: p.row, dir: p.dir, pixelX: p.col * 32, pixelY: p.row * 32,
      fromX: p.col * 32, fromY: p.row * 32, toX: p.col * 32, toY: p.row * 32, moving: false, moveTimer: 0 });
  }, st);
  await page.waitForTimeout(200);
}

/** Tool availability as DRAWN: halo arcs (r 16–18, green stroke) and popup emoji bubbles. */
export function drawnAvailability(fr) {
  const halos = fr.a.filter((a) => a.rad >= 15.9 && a.rad <= 18.1 && /rgba\(46,\s*125,\s*50/.test(a.stroke));
  const popups = fr.t.filter((x) => (x.s === '🌾' || x.s === '🪣' || x.s === '💧') && /^14px sans-serif/.test(x.font));
  // frames repeat inside the 200 ms window: report the distinct bubbles
  return { halos: halos.length, popups: [...new Set(popups.map((p) => p.s))].sort() };
}

/* Read the numeric score from the canvas game hook; the score is not a DOM element. */
export const readScore = (page) => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const key = Object.keys(cv).find((k) => k.startsWith('__reactFiber$'));
  const STATES = new Set(['INIT', 'READY', 'PLAYING', 'PAUSED', 'COMPLETED', 'FAILED']);
  for (let f = cv[key]; f; f = f.return) {
    if (typeof f.type !== 'function') continue;
    for (let h = f.memoizedState; h && h.next; h = h.next) {
      if (h.queue && STATES.has(h.memoizedState) && h.next.queue && typeof h.next.memoizedState === 'number') {
        return h.next.memoizedState;
      }
    }
  }
  return null;
});
