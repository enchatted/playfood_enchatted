/**
 * HiDPI canvas support — keeps every canvas backing store matched to its
 * displayed CSS size × devicePixelRatio, so 8–14px canvas text stays sharp
 * on Retina laptops, projectors and interactive whiteboards.
 *
 * All game/overworld code keeps drawing in logical 1280×704 coordinates;
 * beginFrame() applies a uniform scale (k) plus a centring offset (ox, oy)
 * every frame, and getCanvasPointer() in utils/canvas.js reads the same
 * geometry back to map clicks into logical space.
 *
 * The geometry lives on the canvas element itself (canvas.__hidpi) so the
 * pointer helper can find it without imports or shared state.
 */

// Temporary comparison flags for the by-eye decisions: ?snap=1 snaps k to
// half-pixel steps (crisper pixel art, slight letterbox); ?hidpi=0 disables
// the whole mechanism (the pre-fix blurry rendering, kept as an A/B control).
// Remove the losing variants once the choices are made.
const PARAMS = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search)
  : new Map();
const SNAP = PARAMS.get('snap') === '1';
const DISABLED = PARAMS.get('hidpi') === '0';

export function attachHiDPI(canvas, logicalW, logicalH) {
  if (DISABLED) return () => {};
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(rect.width * dpr);
    const bh = Math.round(rect.height * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      // Resizing wipes the bitmap; the next RAF repaints it.
      canvas.width = bw;
      canvas.height = bh;
    }
    // Uniform scale + centring: also handles boxes whose aspect ratio differs
    // from 1280×704 (the objectFit:'contain' letterbox case).
    let k = Math.min(bw / logicalW, bh / logicalH);
    if (SNAP) k = Math.max(0.5, Math.floor(k * 2) / 2);
    canvas.__hidpi = {
      k,
      ox: (bw - logicalW * k) / 2,
      oy: (bh - logicalH * k) / 2,
      logicalW,
      logicalH,
    };
  };

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  // ResizeObserver misses DPR-only changes (dragging to another monitor).
  window.addEventListener('resize', resize);
  return () => {
    ro.disconnect();
    window.removeEventListener('resize', resize);
  };
}

/**
 * Called at the top of every frame by the three RAF hooks. Clears the full
 * buffer, then sets the logical-space transform. Falls back to identity when
 * no HiDPI geometry is attached (tests, legacy stubs).
 */
export function beginFrame(ctx, canvas) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const h = canvas.__hidpi;
  if (h) ctx.setTransform(h.k, 0, 0, h.k, h.ox, h.oy);
  ctx.imageSmoothingEnabled = false;
}

// CSS px that one logical px occupies on screen. With the HiDPI path the buffer is
// CSS size × dpr and the logical frame is scaled by k, so it is k / dpr.
export function canvasCssScale(canvas) {
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !canvas.width) return 1;
  const h = canvas.__hidpi;
  return h ? (h.k * rect.width) / canvas.width : rect.width / canvas.width;
}

// Growth factor for a canvas card so text of `basePx` logical px reads at ≥ minCssPx on
// screen (the Leftover Chef rule). 1 on full-size screens, about 1.8 on 844×390.
export function readableUnit(cssScale, basePx, minCssPx = 13) {
  if (!Number.isFinite(cssScale) || cssScale <= 0) return 1;
  return Math.max(1, minCssPx / (basePx * cssScale));
}

// A screen-space top HUD (harbour, island room, Lighthouse) draws under ctx.scale(u, u)
// so its 13 px labels read at ≥ 12 CSS px on a phone; 1 on laptops and tablets.
export function readableHudUnit(ctx) {
  return readableUnit(canvasCssScale(ctx?.canvas), 13, 12);
}

// CSS px per unit of the current draw transform, camera zoom included (world-space labels).
export function transformCssScale(ctx) {
  const canvas = ctx?.canvas;
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function' || typeof ctx.getTransform !== 'function') return 1;
  const rect = canvas.getBoundingClientRect();
  return rect.width && canvas.width ? (ctx.getTransform().a * rect.width) / canvas.width : 1;
}

// A rect published for hit-testing while drawing under ctx.scale(u, u), back in canvas coords.
export function scaleRectBy(rect, u) {
  return rect && { x: rect.x * u, y: rect.y * u, width: rect.width * u, height: rect.height * u };
}
