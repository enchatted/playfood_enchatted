import { describe, expect, it } from 'vitest';
import { renderGuideBanner } from './soilDoctorRenderer.js';
import { roomToCanvas, OX, OY } from './gameRoomRenderer.js';
import { GAME_ROOMS } from './gameRoomData.js';
import en from '../../i18n/locales/en.json';
import el from '../../i18n/locales/el.json';
import nl from '../../i18n/locales/nl.json';
import pt from '../../i18n/locales/pt.json';

function recorder() {
  const boxes = [], texts = [];
  const ctx = {
    font: '', lineWidth: 1, shadowBlur: 0,
    save() { this.savedBlur = this.shadowBlur; }, restore() { this.shadowBlur = this.savedBlur; },
    beginPath() { this.points = []; },
    moveTo(x, y) { this.points.push([x, y]); }, lineTo(x, y) { this.points.push([x, y]); },
    quadraticCurveTo(cx, cy, x, y) { this.points.push([cx, cy], [x, y]); },
    closePath() {}, stroke() {},
    fill() {
      const xs = this.points.map(([x]) => x), ys = this.points.map(([, y]) => y);
      const glow = this.shadowBlur + 1;
      boxes.push({ left: Math.min(...xs) - glow, right: Math.max(...xs) + glow,
        top: Math.min(...ys) - glow, bottom: Math.max(...ys) + glow });
    },
    measureText(text) { return { width: text.length * 8 }; },
    fillText(text, x, y) { texts.push({ text, x, y, width: this.measureText(text).width }); },
  };
  return { ctx, boxes, texts };
}

const room = GAME_ROOMS.SoilDoctor;
const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe('Soil guide stays above the remedy stations and beside the meter', () => {
  for (const [language, locale] of Object.entries({ en, el, nl, pt })) {
    for (const step of ['inspect', 'grab', 'treat']) {
      it(`${language}/${step}: draws every word without covering a station or HUD chip`, () => {
        const draw = recorder();
        const labels = Object.fromEntries(['inspect', 'grab', 'treat'].map((key) => [key, locale.soildoctor[`guide_${key}`]]));
        renderGuideBanner(draw.ctx, { guideStep: step, guideLabels: labels, time: Math.PI / 6 });
        expect(draw.boxes).toHaveLength(1);
        const box = draw.boxes[0];
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThan(520); // actual soil meter's left edge
        expect(draw.texts.map(({ text }) => text).join(' ')).toBe(`${{ inspect: 1, grab: 2, treat: 3 }[step]} · ${labels[step]}`);
        for (const text of draw.texts) {
          expect(text.x - text.width / 2).toBeGreaterThan(box.left + 7);
          expect(text.x + text.width / 2).toBeLessThan(box.right - 7);
          expect(text.y - 8).toBeGreaterThan(box.top);
          expect(text.y + 8).toBeLessThan(box.bottom);
        }
        for (const station of room.remedyStations) {
          const cols = station.tiles.map(({ col }) => col), rows = station.tiles.map(({ row }) => row);
          const a = roomToCanvas(room, OX + Math.min(...cols) * 32 - 8, OY + Math.min(...rows) * 32 - 8);
          const b = roomToCanvas(room, OX + (Math.max(...cols) + 1) * 32 + 8, OY + (Math.max(...rows) + 1) * 32 + 8);
          expect(intersects(box, { left: a.x, top: a.y, right: b.x, bottom: b.y }), station.key).toBe(false);
        }
      });
    }
  }
});
