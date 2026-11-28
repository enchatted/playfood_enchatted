export function getGardenCarryAnchor({ x, y, minTop, fieldLeft, fieldRight }) {
  if (y - 48 >= minTop) return { x, y };
  return {
    x: x > (fieldLeft + fieldRight) / 2 ? x - 44 : x + 44,
    y: minTop + 48,
  };
}
