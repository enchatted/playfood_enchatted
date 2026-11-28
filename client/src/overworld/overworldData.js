// Tile-based overworld constants — "Sailing the Archipelago" grid system

import { ISLAND_COLORS } from '../styles/brandColors.js';

export const TILE_SIZE = 32;

// Canvas / viewport
export const CANVAS_W = 1280;
export const CANVAS_H = 704;  // 22 tiles × 32px
export const VIEW_COLS = 28;  // slightly zoomed out (was 24)
export const VIEW_ROWS = 16;  // slightly zoomed out (was 14)
export const VIEW_SCALE = CANVAS_W / (VIEW_COLS * TILE_SIZE);  // ~1.429

// Movement
export const MOVE_DURATION = 0.13;  // seconds per walking tile
export const SAIL_DURATION = 0.13;  // seconds per sailing tile

// Camera
export const CAMERA_LERP = 0.12;  // smoothing factor (0–1)

// HUD
export const HUD_HEIGHT = 36;  // top bar in pixels

// Missions per island in the 4×3 structure. Completion visuals
// (island evolution, water tint, signs, ceremony) MUST divide by this —
// scattered literal 4s were the bug that kept islands from ever going lush.
export const MISSIONS_PER_ISLAND = 3;

// Island metadata — dock positions are the water tile at each dock's end
// (where the boat stops to trigger island entry).
// Pillar colors come from styles/brandColors.js (canvas-safe mirror of tokens.css).
export const ISLANDS = {
  foodwaste:  { color: ISLAND_COLORS.foodwaste, dockCol: 12, dockRow: 16 },  // Food Waste Reduction
  local:      { color: ISLAND_COLORS.local,     dockCol: 47, dockRow: 16 },  // Local & Seasonal Eating
  growing:    { color: ISLAND_COLORS.growing,   dockCol: 12, dockRow: 23 },  // Growing Our Own Food
  circular:   { color: ISLAND_COLORS.circular,  dockCol: 47, dockRow: 23 },  // Circular Economy
  recycling:  { color: ISLAND_COLORS.recycling, dockCol: 28, dockRow: 35 },  // hub
};

// Phygital buoy — central water terminal for code entry
export const PHYGITAL_BUOY = { col: 29, row: 20 };

// Player (boat) directions
export const DIR = {
  DOWN: 0,
  UP: 1,
  LEFT: 2,
  RIGHT: 3,
};

// Water animation
export const WATER_FRAME_DURATION = 0.5;  // seconds per frame
export const WATER_FRAMES = 3;
