// JS mirror of brand tokens for canvas-bound code.
// Canvas 2D context cannot resolve CSS variables, so brand colors
// used by canvas renderers live here as plain strings.
//
// MUST stay in sync with client/src/styles/tokens.css :root vars.
//
// COMMENT CONVENTION (so we always know the source of every color):
//   OFFICIAL PLAYFOOD  — color appears in the Playfood Brand Guideline
//                        PDF (Oct 2025), pages 09–10. Includes the
//                        --pf-* CSS token name where applicable.
//   DERIVED WORLD_ART  — NOT an official Playfood color. Derived from
//                        a BRAND token via a documented rule
//                        (tonal scale, hue-locked blend, desat-to-neutral).
//   LEGACY / FUNCTIONAL — NOT official Playfood. Kept on purpose
//                         (warning red, reward gold, legacy recycling
//                         green, etc.). Each entry explains why.

// ─────────────────────────────────────────────────────────────
// OFFICIAL Playfood palette — mirror of tokens.css :root vars.
// Source: Brand guidelines & toolkit/Playfood_Brand Guideline.pdf
// (pages 09–10, Oct 2025). Do not invent values here.
// ─────────────────────────────────────────────────────────────
export const BRAND = {
  // ── Core 5 pillar colors (PDF p.09) ────────────────────────
  orange: '#E07F37',  // OFFICIAL PLAYFOOD — Brand Guideline PDF p.09 (--pf-orange / Local & Seasonal Eating)
  blue:   '#235FB7',  // OFFICIAL PLAYFOOD — Brand Guideline PDF p.09 (--pf-blue   / Circular & Climate Change)
  red:    '#D36244',  // OFFICIAL PLAYFOOD — Brand Guideline PDF p.09 (--pf-red    / Food Waste Reduction)
  green:  '#6DB06C',  // OFFICIAL PLAYFOOD — Brand Guideline PDF p.09 (--pf-green  / nature-growth pillar)
  purple: '#533F8B',  // OFFICIAL PLAYFOOD — Brand Guideline PDF p.09 (--pf-purple / UI chrome & accents)

  // ── Soft / secondary palette (PDF p.10) ────────────────────
  yellowSoft:  '#F7E1A4', // OFFICIAL PLAYFOOD — Brand Guideline PDF p.10 (--pf-yellow-soft)
  blueSoft:    '#CED3F4', // OFFICIAL PLAYFOOD — Brand Guideline PDF p.10 (--pf-blue-soft)
  yellowGreen: '#E0E07E', // OFFICIAL PLAYFOOD — Brand Guideline PDF p.10 (--pf-yellow-green)
  cream:       '#FBF6C9', // OFFICIAL PLAYFOOD — Brand Guideline PDF p.10 (--pf-cream)
  pink:        '#E5BDD1', // OFFICIAL PLAYFOOD — Brand Guideline PDF p.10 (--pf-pink)

  // ── Functional text colors (typography section of guidelines) ──
  text:        '#1A1A1A', // OFFICIAL PLAYFOOD — body text on light backgrounds (typography section)
  textOnColor: '#FFFFFF', // OFFICIAL PLAYFOOD — text on colored / dark backgrounds (typography section)

  // ── Legacy / functional constants ──────────────────────────
  // LEGACY / FUNCTIONAL — not official Playfood.
  // #4CAF50 is Material Green. Kept for backwards-compat with the
  // recycling hub island until that surface is finally re-routed to
  // WORLD_ART.recyclingHub (in progress across Phase I.B/I.F).
  recyclingLegacyGreen: '#4CAF50',
};

// ─────────────────────────────────────────────────────────────
// DERIVED world-art palette — NOT official Playfood brand colors.
// Proposed game-art shades derived from the BRAND palette by
// documented derivation rules.
//
// Each entry cites its source BRAND token (luminance scale,
// hue-locked blend, or desaturation-to-neutral). No invented
// hue families. Constants live here because canvas 2D context
// cannot resolve CSS variables.
// ─────────────────────────────────────────────────────────────
export const WORLD_ART = {
  // ── Water & ocean — derived from BRAND.blue tonal scale ──
  // Policy (2026-05-11): oceanMid (= official Playfood blue #235FB7) is
  // the main "this is water" tone. Deep water is a derived darker shade.
  // Shallow water keeps oceanMid as its dominant fill so the eye still
  // reads "Playfood blue" near the shoreline; lighter wave tones provide
  // depth variation. oceanShallow (= --pf-blue-soft) is FOAM-ONLY — never
  // used as a dominant tile fill, only as small highlight/foam accents.
  oceanDeep:      '#1A4A8E',      // DERIVED WORLD_ART — BRAND.blue × 0.78 luminance (darker deep-ocean shade)
  oceanMid:       BRAND.blue,     // OFFICIAL PLAYFOOD passthrough — re-exports --pf-blue as canonical water tone
  oceanWaveMid:   '#5B89D0',      // DERIVED WORLD_ART — BRAND.blue × 1.15 luminance (wave body)
  oceanWaveLight: '#89A5DC',      // DERIVED WORLD_ART — 50% BRAND.blue + 50% BRAND.blueSoft (outer wave)
  oceanShallow:   BRAND.blueSoft, // OFFICIAL PLAYFOOD passthrough — re-exports --pf-blue-soft for foam/highlight ONLY

  // ── Sand & beach — derived from BRAND.cream + BRAND.yellowSoft ──
  sandHighlight: '#FDFBEA',        // DERIVED WORLD_ART — BRAND.cream + 50% white (sun-bleached sand)
  sandBase:      BRAND.cream,      // OFFICIAL PLAYFOOD passthrough — re-exports --pf-cream
  sandShadow:    BRAND.yellowSoft, // OFFICIAL PLAYFOOD passthrough — re-exports --pf-yellow-soft (sand shadow)

  // ── Grass — derived from BRAND.green tonal scale + yellow-green blend ──
  grassLight: '#9BC373',     // DERIVED WORLD_ART — 60% BRAND.green + 40% BRAND.yellowGreen
  grassMid:   BRAND.green,   // OFFICIAL PLAYFOOD passthrough — re-exports --pf-green (canonical grass tone)
  grassDeep:  '#558954',     // DERIVED WORLD_ART — BRAND.green × 0.78 luminance
  grassDark:  '#477246',     // DERIVED WORLD_ART — BRAND.green × 0.65 luminance

  // ── Tree foliage — derived from BRAND.green tonal scale (3 stops) ──
  foliageLight: '#7DCA7C',   // DERIVED WORLD_ART — BRAND.green × 1.15 luminance (canopy top)
  foliageMid:   '#5D965C',   // DERIVED WORLD_ART — BRAND.green × 0.85 luminance (canopy body)
  foliageDeep:  '#3C613B',   // DERIVED WORLD_ART — BRAND.green × 0.55 luminance (canopy shadow)

  // ── Path / dirt / soil — derived warm-stone (no brand brown exists) ──
  // Base hue derived from BRAND.yellowSoft desaturated to ~30% S,
  // luminance stepped down for shadow/deep.
  pathBase:   '#B89E7A',     // DERIVED WORLD_ART — BRAND.yellowSoft desat ~30% S, lum 60%
  pathMid:    '#9A8466',     // DERIVED WORLD_ART — pathBase × 0.85 luminance
  dirtAccent: '#7A5C40',     // DERIVED WORLD_ART — BRAND.yellowSoft desat ~35% S, lum 35%
  dirtDeep:   '#5A4230',     // DERIVED WORLD_ART — dirtAccent × 0.75 luminance

  // ── Wood (dock, building, counter) — same warm-wood family ──
  wood:        '#B89E7A',    // DERIVED WORLD_ART — shares pathBase tone (warm-wood family)
  woodMid:     '#9A8466',    // DERIVED WORLD_ART — wood × 0.85 luminance
  woodShadow:  '#7A5C40',    // DERIVED WORLD_ART — wood × 0.65 luminance
  woodDeep:    '#4C3826',    // DERIVED WORLD_ART — wood × 0.42 luminance
  counterWarm: '#A88A5F',    // DERIVED WORLD_ART — wood + amber blend (kitchen counter)

  // ── Stone / rock — derived warm-neutral (no brand grey exists) ──
  // BRAND.yellowSoft desaturated to ~8% S retains brand temperature.
  stoneLight:  '#D2CFC6',    // DERIVED WORLD_ART — BRAND.yellowSoft desat ~8% S, lum 80%
  stoneMid:    '#ACA89E',    // DERIVED WORLD_ART — stoneLight × 0.82 luminance
  stoneShadow: '#848179',    // DERIVED WORLD_ART — stoneLight × 0.62 luminance
  stoneCool:   '#BCBFC3',    // DERIVED WORLD_ART — cool-neutral variant, 210° H, 5% S (kept brand-temperature-adjacent)
  pebbleLight: '#E5DCC9',    // DERIVED WORLD_ART — stoneLight + 30% BRAND.cream
  pebbleDark:  '#C2B59E',    // DERIVED WORLD_ART — stoneMid + 25% BRAND.yellowSoft

  // ── Recycling hub differentiated green ────────────────────
  // DERIVED WORLD_ART — grad-green midpoint (BRAND.green + BRAND.cream blend).
  // Selected 2026-05-11 to differentiate the recycling hub from the
  // Circular pillar island, which keeps BRAND.green.
  recyclingHub: '#B4D39A',   // DERIVED WORLD_ART — BRAND.green + BRAND.cream blend (hub identity)

  // ── Island-1 canonized chrome: canonize, don't repaint ──
  // LEGACY / FUNCTIONAL — NOT official Playfood, NOT derived. The de-facto
  // UI chrome of Island 1 proved consistent across all 3 games + island
  // room; that consistency IS the brand, so the values were promoted to
  // tokens as-is.
  // Do NOT repaint these to BRAND.* equivalents without a visual A/B.
  panelCream:     '#FFF8E1', // panel/card fill — kept over BRAND.cream (cream is yellower, worse for text)
  textGreen:      '#33691E', // dark green chrome text + panel/pill borders
  buttonGreen:    '#558B2F', // button fills + panel header bands
  panelBrown:     '#5D4037', // panel body text (brown family)
  panelBrownDeep: '#3E2723', // panel quote / emphasis text (deep brown)
  pillBorder:     '#A5D6A7', // instruction prompt-pill border (shared 3-game pattern)
  meadow:         '#8FBF6E', // game-screen meadow backdrop — one island, one meadow (WDIG/SD/GP)

  // ── Island-2 market chrome («vibrant market») ──
  // Structural palette of the «Λαϊκή Αγορά» island room: warm morning sky,
  // striped awnings, perimeter earth. Accent stays BRAND.orange (the Local &
  // Seasonal pillar). Prop art inside vignettes stays raw hex (thematic, same
  // convention as growing's beds/fence details).
  marketSkyTop:   '#FFD9A0', // morning sky gradient — top
  marketSkyMid:   '#FFE9C7', // morning sky gradient — middle
  marketSkyLow:   '#F5D9A8', // morning sky gradient — horizon
  marketSun:      '#FFCC80', // morning sun disc
  marketEarth:    '#EFD9B4', // packed earth behind the perimeter barrier
  marketPaving:   '#F7E8BE', // sunlit market paving; replaces the heavy wood field
  marketPavingHi: '#FFF8E1', // alternating warm-cream paving tile
  marketPavingLn: '#DFC985', // soft pixel grout, visible without darkening the room
  marketFrame:    '#D8A34F', // light honey frame for child-friendly market stalls
  marketFrameHi:  '#F3CF7A', // sunlit edge on stall frames and shelves
  marketCounter:  '#FFF6D8', // pale canvas counter front
  marketCrate:    '#E9B968', // light produce crate, reserved for small props
  marketCrateLn:  '#B97836', // restrained outline; never used as a large fill
  marketFence:    '#E2B96F', // pale honey rail around the open-air market
  marketFenceHi:  '#FFE4A8', // sunlit top edge on the market barrier
  marketFencePost:'#D19755', // warm post; strong enough to read without looking heavy
  marketZoneSeason:'#FBE9DE', // coral-tinted paving around Season Matcher
  marketZoneLocal: '#E2F3DC', // leaf-tinted paving around Market Trip
  marketZoneMentor:'#FCF0CC', // sunny paving around the Market Keeper
  marketZoneLabels:'#E4EFF9', // sky-blue paving around Spot the Fake
  awningGreen:    '#43A047', // 2nd awning stripe color (alternates with BRAND.orange)
  buntingGreen:   '#66BB6A', // bunting triangle green
  stallCloth:     '#FFF3E0', // stall counter cloth

  // ── Island-3 teaching kitchen («bright learning kitchen») ──
  // Large surfaces stay warm and pale. Stronger coral/mint/honey colors are
  // reserved for rims and small teaching cues, so the room remains legible.
  kitchenFloor:       '#F6EED7', // warm cream shared floor
  kitchenFloorHi:     '#FFF9E9', // alternating tile highlight
  kitchenGrout:       '#DDD3BC', // soft grout, never a dark grid
  kitchenZoneFridge:  '#A9CDB5', // Island-1 sage blend: storage / fridge
  kitchenZonePlan:    '#A9C77F', // Island-1 leaf blend: planning meals
  kitchenZoneChef:    '#E2D18A', // Island-1 wheat blend: Chef / learning corner
  kitchenZoneLeftover:'#D9B991', // Island-1 warm-earth blend: leftovers become a new meal
  kitchenCounter:     '#FFF4D8', // pale prep-counter front
  kitchenFrame:       '#D8A760', // light honey furniture frame
  kitchenFrameHi:     '#F2D08D', // sunlit furniture edge
  kitchenCoral:       '#EE765F', // food-waste pillar accent
  kitchenMint:        '#78BFA1', // clean/fresh secondary accent
};

// ─────────────────────────────────────────────────────────────
// Island slug → color map (consumed by overworldData + tileAtlas).
// Recycling still maps to the legacy Material green here; the
// re-route to WORLD_ART.recyclingHub is happening per-surface
// in Phase I.B / I.F (terrain + hub chrome).
// ─────────────────────────────────────────────────────────────
export const ISLAND_COLORS = {
  growing:   BRAND.green,                // I1 Growing Our Own Food (nature)
  local:     BRAND.orange,               // OFFICIAL PLAYFOOD — Local & Seasonal pillar
  foodwaste: BRAND.red,                  // OFFICIAL PLAYFOOD — Food Waste Reduction pillar
  circular:  BRAND.blue,                 // I4 Climate & Circular (merged; was green)
  recycling: BRAND.recyclingLegacyGreen, // LEGACY / FUNCTIONAL — see BRAND.recyclingLegacyGreen comment
};
