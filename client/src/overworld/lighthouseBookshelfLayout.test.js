import { describe, expect, it, vi } from 'vitest';
import * as canvas from '../utils/canvas.js';
import { renderBookPanel, renderBookshelf } from './lighthouseRoomRenderer.js';
import { buildBookshelf, ISLAND_SLUGS } from './lighthouseBookshelf.js';
import { LIGHTHOUSE_BOOKSHELF_FOOTPRINT, LIGHTHOUSE_COLS, LIGHTHOUSE_ROWS } from './lighthouseData.js';
import { CANVAS_W, CANVAS_H, TILE_SIZE } from './overworldData.js';
import { ISLAND_COLORS } from '../styles/brandColors.js';

function drawingRecorder() {
  const rectangles = [];
  const badges = [];
  const texts = [];
  const saved = [];
  const context = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
    font: '', textAlign: '', textBaseline: '',
    save() {
      saved.push(Object.fromEntries(['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'font', 'textAlign', 'textBaseline'].map((key) => [key, this[key]])));
    },
    restore() { Object.assign(this, saved.pop()); },
    fillRect(x, y, width, height) {
      rectangles.push({ x, y, width, height, color: this.fillStyle, alpha: this.globalAlpha });
    },
    beginPath() { this.circle = null; },
    arc(x, y, radius) { this.circle = { x, y, radius }; },
    fill() {
      if (this.circle && this.fillStyle === '#FFEB3B') badges.push(this.circle);
    },
    stroke() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
    fillText(text, x, y) { texts.push({ text, x, y }); },
  };
  return { context, rectangles, badges, texts };
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

it('keeps a short pending label in its original badge and encloses a longer label including the exclamation mark', () => {
  const rectangles = vi.spyOn(canvas, 'drawRoundedRect');
  try {
    for (const [pending, labelWidth] of [['provisório', 49], ['in behandeling', 69]]) {
      const { context, texts } = drawingRecorder();
      const label = '! ' + pending;
      context.arcTo = () => {};
      context.measureText = (text) => {
        if (text !== label) return { width: text.length * 6 };
        expect(context.font).toBe("bold 9px 'Inter', system-ui, sans-serif");
        return { width: labelWidth };
      };
      rectangles.mockClear();
      renderBookPanel(context, { bookOpen: { id: 'composting-home', title: 'Composting At Home', publisher: 'EPA', pending: true } }, { bookPanel: { pending } });
      const [, x, , width] = rectangles.mock.calls.find(args => args[6] === '#FFEB3B');
      const center = texts.find(entry => entry.text === label).x;
      expect(center - labelWidth / 2).toBeGreaterThan(x);
      expect(center + labelWidth / 2).toBeLessThan(x + width);
      if (pending === 'provisório') expect(width).toBe(54);
    }
  } finally {
    rectangles.mockRestore();
  }
});

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height;
}

const lockedColors = new Set(['#7894AA', '#A87C72', '#7F987C', '#A58E5E', '#81789D', '#6F928C']);
const islandColors = new Set(Object.values(ISLAND_COLORS));
const completed = Object.fromEntries(ISLAND_SLUGS.map((island) => [island, [1, 2, 3]]));
const footprint = LIGHTHOUSE_BOOKSHELF_FOOTPRINT;
const recess = {
  x: (CANVAS_W - LIGHTHOUSE_COLS * TILE_SIZE) / 2 + footprint.leftCol * TILE_SIZE + 7,
  y: (CANVAS_H - LIGHTHOUSE_ROWS * TILE_SIZE) / 2 + footprint.topRow * TILE_SIZE + 10,
  width: footprint.cols * TILE_SIZE - 14,
  height: footprint.rows * TILE_SIZE - 18,
};

// Bounds come from the fill/arc calls, never from a renderer layout helper.
describe('lighthouse source books stay inside the existing cabinet', () => {
  it.each([
    ['locked', {}],
    ['mixed', { growing: [1], circular: [1] }],
    ['complete', completed],
  ])('draws every %s book, its shadow and each approval badge without overflow', (_, progress) => {
    const shelves = buildBookshelf(progress);
    const original = structuredClone(shelves);
    const spines = ISLAND_SLUGS.flatMap((island) => shelves[island]);
    const draw = drawingRecorder();
    renderBookshelf(draw.context, shelves, 1.25);
    const books = draw.rectangles.filter(({ color, height }) => height > 5
      && (lockedColors.has(color) || islandColors.has(color)));
    const shadows = draw.rectangles.filter(({ color, height }) => height > 5 && color === 'rgba(42,26,14,0.38)');

    expect(books).toHaveLength(spines.length);
    expect(shadows).toHaveLength(spines.length);
    for (const rect of [...books, ...shadows]) {
      expect(contains(recess, rect), JSON.stringify(rect)).toBe(true);
    }
    for (let a = 0; a < books.length; a++) {
      for (let b = a + 1; b < books.length; b++) {
        expect(overlaps(books[a], books[b]), `books ${a}/${b}`).toBe(false);
      }
    }
    const expectedPending = spines.filter(({ unlocked, pending }) => unlocked && pending).length;
    expect(draw.badges).toHaveLength(expectedPending);
    expect(draw.texts.filter(({ text }) => text === '!')).toHaveLength(expectedPending);
    for (const { x, y, radius } of draw.badges) {
      expect(contains(recess, { x: x - radius, y: y - radius, width: 2 * radius, height: 2 * radius })).toBe(true);
    }
    expect(shelves).toEqual(original);
  });

  it('keeps each island in its own consecutive shelf area with all its sources visible', () => {
    const shelves = buildBookshelf(completed);
    const draw = drawingRecorder();
    renderBookshelf(draw.context, shelves, 0);
    let previousBottom = recess.y;
    for (const island of ISLAND_SLUGS) {
      const books = draw.rectangles.filter(({ color, height }) => height > 5 && color === ISLAND_COLORS[island]);
      expect(books).toHaveLength(shelves[island].length);
      const top = Math.min(...books.map(({ y }) => y));
      const bottom = Math.max(...books.map(({ y, height }) => y + height));
      expect(top).toBeGreaterThan(previousBottom);
      previousBottom = bottom;
    }
  });
});
