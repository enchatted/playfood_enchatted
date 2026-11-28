// itemGlyphs.js — drawn icons for items that have no faithful emoji.
//
// There is no emoji for a milk carton. 🥛 is a GLASS of milk and 📦 is a
// parcel, so the Compost Creator milk carton showed the wrong object. Items may now carry
// `icon: 'milkCarton'`; every place that draws an item glyph (stump, carried item, floor item,
// fact card header, focused-item pill) goes through drawItemGlyph(), which draws the vector
// icon when one exists and otherwise falls back to the emoji, exactly as before.
//
// The same geometry is exported as SVG markup (MILK_CARTON_SVG) for the DOM pill, so the
// canvas and the DOM show the same picture.

// Geometry on a 32×32 grid: a gable-top carton, white front, grey side, blue label band.
const OUTLINE = '#455A64';
const SHAPES = [
  { fill: '#ECEFF1', points: [[10, 2], [19, 2], [19, 5], [10, 5]] },              // top seal
  { fill: '#F5F5F5', points: [[8, 11], [10, 5], [19, 5], [20, 11]] },             // front gable
  { fill: '#CFD8DC', points: [[20, 11], [19, 5], [24, 8], [25, 12]] },            // side gable
  { fill: '#FAFAFA', points: [[8, 11], [20, 11], [20, 30], [8, 30]] },            // front face
  { fill: '#B0BEC5', points: [[20, 11], [25, 12], [25, 28], [20, 30]] },          // side face
  { fill: '#1E6FD9', points: [[8, 16], [20, 16], [20, 23], [8, 23]] },            // label band
  { fill: '#1857AD', points: [[20, 16], [25, 16.6], [25, 22.4], [20, 23]] },      // band, side
];
const DOT = { cx: 14, cy: 19.5, r: 2.4, fill: '#FFFFFF' };

// A seedling, onion and leafy-green emoji describe different foods. These three
// Season Matcher products use their own silhouettes, without changing food data.
const PRODUCE_SHAPES = {
  asparagus: [
    { fill: '#76A947', points: [[6, 8], [11, 8], [12, 30], [7, 30]] },
    { fill: '#579139', points: [[13, 5], [18, 5], [19, 30], [14, 30]] },
    { fill: '#88B84E', points: [[21, 9], [26, 9], [25, 30], [20, 30]] },
    { fill: '#496B39', points: [[6, 9], [6, 5], [8, 1], [11, 5], [11, 9], [8, 12]] },
    { fill: '#496B39', points: [[13, 6], [13, 3], [15, 0], [18, 3], [18, 6], [15, 9]] },
    { fill: '#496B39', points: [[21, 10], [21, 7], [24, 3], [26, 7], [26, 10], [23, 13]] },
    { fill: '#B3D571', points: [[8, 15], [10, 15], [10, 28], [8, 28]] },
    { fill: '#B3D571', points: [[15, 12], [17, 12], [17, 28], [15, 28]] },
  ],
  leek: [
    { fill: '#257341', points: [[13, 18], [7, 9], [1, 2], [8, 4], [18, 15]] },
    { fill: '#3C9950', points: [[14, 18], [10, 2], [15, 5], [18, 16]] },
    { fill: '#257341', points: [[17, 18], [20, 3], [24, 0], [22, 11], [20, 19]] },
    { fill: '#4CA456', points: [[18, 18], [25, 8], [31, 4], [26, 15], [21, 21]] },
    { fill: '#AED591', points: [[11, 15], [20, 15], [21, 23], [12, 23]] },
    { fill: '#FFF7DD', points: [[12, 21], [21, 21], [20, 30], [13, 30]] },
    { fill: '#E2D6AA', points: [[13, 30], [15, 30], [14, 32], [12, 32]] },
    { fill: '#E2D6AA', points: [[17, 30], [19, 30], [21, 32], [18, 32]] },
  ],
  cabbage: [
    { fill: '#3F8246', points: [[10, 2], [22, 2], [29, 9], [31, 20], [24, 29], [10, 31], [2, 23], [1, 12]] },
    { fill: '#A8C978', points: [[10, 4], [22, 4], [27, 10], [28, 20], [22, 27], [11, 28], [5, 21], [4, 12]] },
    { fill: '#C8DA94', points: [[10, 7], [18, 5], [24, 10], [22, 18], [14, 21], [7, 17], [6, 11]] },
    { fill: '#81AD62', points: [[25, 11], [28, 20], [22, 27], [14, 26], [15, 22], [23, 18]] },
    { fill: '#DFE8B3', points: [[9, 17], [14, 20], [14, 26], [11, 27], [6, 21]] },
    { fill: '#EFF1CA', points: [[13, 9], [17, 7], [21, 10], [21, 14], [17, 17], [12, 14]] },
  ],
};
const PRODUCE_IDS = new Set(Object.keys(PRODUCE_SHAPES));

export const ITEM_ICONS = new Set(['milkCarton', ...PRODUCE_IDS]);

function itemIcon(item) {
  return item?.icon || (PRODUCE_IDS.has(item?.id) ? item.id : null);
}

export function hasDrawnIcon(item) {
  return ITEM_ICONS.has(itemIcon(item));
}

function drawProduceIcon(ctx, icon, cx, cy, size) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#355838';
  for (const shape of PRODUCE_SHAPES[icon]) {
    ctx.beginPath();
    shape.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = shape.fill;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Draw the milk carton centred on (cx, cy), `size` px tall (≈ the emoji font size it replaces).
export function drawMilkCartonIcon(ctx, cx, cy, size = 24) {
  const s = size / 32;
  ctx.save();
  ctx.translate(cx - 16 * s, cy - 16 * s);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = OUTLINE;
  for (const shape of SHAPES) {
    ctx.beginPath();
    shape.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = shape.fill;
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(DOT.cx, DOT.cy, DOT.r, 0, Math.PI * 2);
  ctx.fillStyle = DOT.fill;
  ctx.fill();
  ctx.restore();
}

// One entry point for every item glyph. `baseline` mirrors the textBaseline the caller used for
// the emoji ('middle' | 'bottom' | 'top'), so the icon lands where the emoji used to.
export function drawItemGlyph(ctx, item, x, y, size = 24, baseline = 'middle') {
  if (hasDrawnIcon(item)) {
    const cy = baseline === 'bottom' ? y - size / 2 : baseline === 'top' ? y + size / 2 : y;
    const icon = itemIcon(item);
    if (icon === 'milkCarton') drawMilkCartonIcon(ctx, x, cy, size);
    else drawProduceIcon(ctx, icon, x, cy, size);
    return;
  }
  ctx.font = `${size}px sans-serif`;
  ctx.textBaseline = baseline;
  ctx.fillText(item?.emoji || '', x, y);
}

// SVG markup of the same icon for the DOM (focused-item pill).
export const MILK_CARTON_SVG = (() => {
  const polys = SHAPES.map((sh) =>
    `<polygon points="${sh.points.map((p) => p.join(',')).join(' ')}" fill="${sh.fill}" stroke="${OUTLINE}" stroke-width="1.1" stroke-linejoin="round"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${polys}<circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${DOT.fill}"/></svg>`;
})();

export const MILK_CARTON_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(MILK_CARTON_SVG)}`;

export function itemGlyphSvg(item) {
  const icon = itemIcon(item);
  if (icon === 'milkCarton') return MILK_CARTON_SVG;
  if (!PRODUCE_IDS.has(icon)) return null;
  const shapes = PRODUCE_SHAPES[icon];
  const polygons = shapes.map(({ fill, points }) =>
    `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="#355838" stroke-width="1" stroke-linejoin="round"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${polygons}</svg>`;
}

// Text contexts (prompts) cannot hold a drawn icon: they show the emoji only when the item has
// no drawn icon, so a prompt never pairs the milk carton's name with another object's emoji.
export function itemTextLabel(item, name) {
  return hasDrawnIcon(item) ? name : `${item.emoji} ${name}`;
}
