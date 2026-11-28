const DEFAULT_MIN_GUTTER = 216;
const RAIL_EDGE_GAP = 24;
const ROOM_EDGE_GAP = 4;
const MAX_RAIL_WIDTH = 300;
const ROOM_OUTER_EDGE_RATIO = 0.125;
const ROOM_INNER_WALL_EDGE_RATIO = 0.1625;

export function getSeasonMatcherGutterLayout(
  stageRect,
  canvasRect,
  minGutter = DEFAULT_MIN_GUTTER,
) {
  if (!stageRect || !canvasRect) {
    return {
      wideGutters: false,
      leftWidth: 0,
      rightWidth: 0,
      leftOffset: 0,
      rightOffset: 0,
    };
  }

  const canvasWidth = Number(canvasRect.width) || Math.max(0, canvasRect.right - canvasRect.left);
  const leftCanvasSpace = Math.max(0, canvasRect.left - stageRect.left);
  const rightCanvasSpace = Math.max(0, stageRect.right - canvasRect.right);
  const leftGutter = leftCanvasSpace + canvasWidth * ROOM_OUTER_EDGE_RATIO;
  const rightGutter = rightCanvasSpace + canvasWidth * ROOM_OUTER_EDGE_RATIO;
  if (leftGutter < minGutter || rightGutter < minGutter) {
    return {
      wideGutters: false,
      leftWidth: 0,
      rightWidth: 0,
      leftOffset: 0,
      rightOffset: 0,
    };
  }

  const leftWidth = Math.min(MAX_RAIL_WIDTH, leftGutter - RAIL_EDGE_GAP);
  const rightWidth = Math.min(MAX_RAIL_WIDTH, rightGutter - RAIL_EDGE_GAP);
  const leftWallEdge = leftCanvasSpace + canvasWidth * ROOM_INNER_WALL_EDGE_RATIO;
  const rightWallEdge = rightCanvasSpace + canvasWidth * ROOM_INNER_WALL_EDGE_RATIO;

  return {
    wideGutters: true,
    leftWidth,
    rightWidth,
    leftOffset: Math.max(0, leftWallEdge - leftWidth - ROOM_EDGE_GAP),
    rightOffset: Math.max(0, rightWallEdge - rightWidth - ROOM_EDGE_GAP),
  };
}
