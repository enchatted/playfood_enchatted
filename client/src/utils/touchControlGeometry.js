import { getTouchControlLayout } from './touchControls.js';

/**
 * CSS-pixel rectangles relative to the active canvas, not logical game pixels.
 * safePlayRect is a conservative area above the controls, not a canvas resize.
 * Consumers must check fits before enabling a new viewport profile.
 */
export function getTouchControlGeometry({ width, height, profile, mission, capabilities = {}, insets = {} }) {
  const layout = getTouchControlLayout(profile);
  const left = Math.max(0, insets.left || 0);
  const right = Math.max(0, insets.right || 0);
  const top = Math.max(0, insets.top || 0);
  const bottom = Math.max(0, insets.bottom || 0);
  const rectFromBottomRight = (offsetRight, offsetBottom, size) => ({
    left: width - right - offsetRight - size,
    top: height - bottom - offsetBottom - size,
    width: size,
    height: size,
  });
  const footprint = layout.dpadButtonSize * 3 + layout.dpadGap * 2;
  const dpadTop = height - bottom - layout.dpadBottom - footprint;
  const actionBottom = layout.actionBottom;
  const controls = {
    dpad: capabilities.movement ? {
      left: left + layout.dpadLeft,
      top: dpadTop,
      width: footprint,
      height: footprint,
    } : null,
    action: capabilities.action ? rectFromBottomRight(
      layout.actionRight, actionBottom, layout.actionButtonSize,
    ) : null,
    drop: capabilities.drop ? rectFromBottomRight(
      layout.actionRight + layout.actionButtonSize + 16,
      actionBottom + (layout.actionButtonSize - layout.secondaryButtonSize) / 2,
      layout.secondaryButtonSize,
    ) : null,
    back: capabilities.back ? rectFromBottomRight(
      layout.actionRight + (layout.actionButtonSize - layout.secondaryButtonSize) / 2,
      actionBottom + layout.actionButtonSize + 12,
      layout.secondaryButtonSize,
    ) : null,
  };
  const occupied = Object.values(controls).filter(Boolean);
  const playBottom = occupied.length
    ? Math.min(...occupied.map(rect => rect.top)) - 12
    : height - bottom;
  const overlaps = (a, b) => a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
  const fits = width > left + right && height > top + bottom
    && occupied.every(rect => rect.left >= left && rect.top >= top
      && rect.left + rect.width <= width - right
      && rect.top + rect.height <= height - bottom)
    && !occupied.some((rect, index) => occupied.slice(index + 1).some(other => overlaps(rect, other)));

  return {
    layout,
    controls,
    fits,
    safePlayRect: {
      left, top,
      width: Math.max(0, width - left - right),
      height: Math.max(0, playBottom - top),
    },
  };
}

export function getFittingTouchControlGeometry(options) {
  const profiles = options.profile === 'standard'
    ? ['standard', 'compact-landscape', 'phone-landscape']
    : options.profile === 'compact-landscape'
      ? ['compact-landscape', 'phone-landscape'] : ['phone-landscape'];
  let geometry;
  for (const profile of profiles) {
    geometry = getTouchControlGeometry({ ...options, profile });
    if (geometry.fits) return geometry;
  }
  return geometry;
}

/** Only the overlay is clipped. The canvas and its hit-test geometry are untouched. */
export function getCanvasControlBounds({ canvas, stage, viewport, insets = {} }) {
  const left = Math.max(canvas.left, viewport.left + (insets.left || 0));
  const top = Math.max(canvas.top, viewport.top + (insets.top || 0));
  const right = Math.min(canvas.left + canvas.width,
    viewport.left + viewport.width - (insets.right || 0));
  const bottom = Math.min(canvas.top + canvas.height,
    viewport.top + viewport.height - (insets.bottom || 0));
  if (right <= left || bottom <= top) return null;
  return { left: left - stage.left, top: top - stage.top, width: right - left, height: bottom - top };
}
