import React from 'react';
import { DRAFT_MODE } from '../config/draftMode.js';

/**
 * Pixel-art style SVG islands for the WorldMap.
 * Each island has unique terrain, trees, and character.
 * Uses shape-rendering: crispEdges for pixel-art look.
 */

const CRISP = { shapeRendering: 'crispEdges' };

// DRAFT_MODE helper — renders a simple colored ellipse with a label
function DraftIsland({ color, label, width = 180, height = 130 }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <ellipse cx={width / 2} cy={height * 0.65} rx={width * 0.4} ry={height * 0.25} fill={color} />
      <ellipse cx={width / 2} cy={height * 0.58} rx={width * 0.32} ry={height * 0.18} fill={color} opacity="0.7" />
      <text
        x={width / 2}
        y={height * 0.65}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontWeight="700"
        fontSize={width < 100 ? 8 : 14}
        fontFamily="sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}

// Food Waste Island — warm/red, apple tree, fridge
export function FoodWasteIsland() {
  if (DRAFT_MODE) return <DraftIsland color="#FF7043" label="Food Waste" />;
  return (
    <svg width="180" height="130" viewBox="0 0 180 130" fill="none">
      {/* Water reflection */}
      <ellipse cx="90" cy="120" rx="85" ry="12" fill="#64B5F6" opacity="0.3" />
      {/* Sand base */}
      <ellipse cx="90" cy="100" rx="80" ry="22" fill="#FFE0B2" {...CRISP} />
      <ellipse cx="90" cy="96" rx="75" ry="18" fill="#FFCC80" {...CRISP} />
      {/* Grass */}
      <ellipse cx="90" cy="90" rx="65" ry="14" fill="#A5D6A7" {...CRISP} />
      <ellipse cx="85" cy="86" rx="55" ry="10" fill="#81C784" {...CRISP} />
      {/* Hill */}
      <ellipse cx="70" cy="78" rx="30" ry="20" fill="#66BB6A" {...CRISP} />
      {/* Apple tree trunk */}
      <rect x="65" y="45" width="8" height="30" rx="2" fill="#795548" {...CRISP} />
      {/* Apple tree crown */}
      <circle cx="69" cy="38" r="18" fill="#4CAF50" {...CRISP} />
      <circle cx="60" cy="42" r="12" fill="#43A047" {...CRISP} />
      <circle cx="78" cy="42" r="12" fill="#43A047" {...CRISP} />
      {/* Apples */}
      <circle cx="62" cy="35" r="4" fill="#F44336" {...CRISP} />
      <circle cx="76" cy="33" r="4" fill="#F44336" {...CRISP} />
      <circle cx="69" cy="28" r="3.5" fill="#FF5722" {...CRISP} />
      {/* Small bush */}
      <ellipse cx="115" cy="88" rx="12" ry="8" fill="#66BB6A" {...CRISP} />
      {/* Small fridge icon */}
      <rect x="108" y="72" width="12" height="16" rx="2" fill="#E0E0E0" {...CRISP} />
      <rect x="110" y="74" width="8" height="6" fill="#FAFAFA" {...CRISP} />
      <rect x="110" y="82" width="8" height="4" fill="#F5F5F5" {...CRISP} />
    </svg>
  );
}

// Local & Seasonal Island — golden, wheat field, farm
export function LocalIsland() {
  if (DRAFT_MODE) return <DraftIsland color="#FFB300" label="Local" />;
  return (
    <svg width="180" height="130" viewBox="0 0 180 130" fill="none">
      <ellipse cx="90" cy="120" rx="85" ry="12" fill="#64B5F6" opacity="0.3" />
      {/* Sand */}
      <ellipse cx="90" cy="100" rx="82" ry="22" fill="#FFE0B2" {...CRISP} />
      <ellipse cx="90" cy="96" rx="76" ry="18" fill="#FFCC80" {...CRISP} />
      {/* Grass field */}
      <ellipse cx="90" cy="90" rx="68" ry="15" fill="#C5E1A5" {...CRISP} />
      <ellipse cx="90" cy="86" rx="58" ry="11" fill="#AED581" {...CRISP} />
      {/* Small hill */}
      <ellipse cx="50" cy="80" rx="25" ry="16" fill="#8BC34A" {...CRISP} />
      {/* Wheat stalks */}
      {[30, 42, 54, 66, 78, 90, 102, 114].map((x, i) => (
        <g key={i}>
          <line x1={x} y1={85 - (i % 3) * 4} x2={x} y2={65 - (i % 3) * 4} stroke="#F9A825" strokeWidth="2" {...CRISP} />
          <ellipse cx={x} cy={62 - (i % 3) * 4} rx="3" ry="5" fill="#FFD54F" {...CRISP} />
        </g>
      ))}
      {/* Barn */}
      <rect x="115" y="68" width="22" height="18" fill="#D84315" {...CRISP} />
      <polygon points="115,68 126,55 137,68" fill="#BF360C" {...CRISP} />
      <rect x="122" y="76" width="8" height="10" fill="#4E342E" {...CRISP} />
      {/* Sun */}
      <circle cx="155" cy="20" r="12" fill="#FFD54F" {...CRISP} />
    </svg>
  );
}

// Climate Impact Island — blue/green, earth, wind turbine
export function ClimateIsland() {
  if (DRAFT_MODE) return <DraftIsland color="#5C6BC0" label="Climate" />;
  return (
    <svg width="180" height="130" viewBox="0 0 180 130" fill="none">
      <ellipse cx="90" cy="120" rx="85" ry="12" fill="#64B5F6" opacity="0.3" />
      {/* Sand */}
      <ellipse cx="90" cy="100" rx="78" ry="22" fill="#EFEBE9" {...CRISP} />
      <ellipse cx="90" cy="96" rx="72" ry="18" fill="#D7CCC8" {...CRISP} />
      {/* Grass */}
      <ellipse cx="90" cy="90" rx="62" ry="14" fill="#A5D6A7" {...CRISP} />
      {/* Rocky hill */}
      <ellipse cx="100" cy="80" rx="28" ry="22" fill="#78909C" {...CRISP} />
      <ellipse cx="95" cy="76" rx="22" ry="18" fill="#90A4AE" {...CRISP} />
      {/* Snow cap */}
      <ellipse cx="95" cy="62" rx="12" ry="6" fill="#ECEFF1" {...CRISP} />
      {/* Wind turbine */}
      <rect x="44" y="42" width="4" height="48" fill="#CFD8DC" {...CRISP} />
      <circle cx="46" cy="42" r="3" fill="#B0BEC5" {...CRISP} />
      {/* Blades */}
      <line x1="46" y1="42" x2="46" y2="22" stroke="#ECEFF1" strokeWidth="3" {...CRISP} />
      <line x1="46" y1="42" x2="63" y2="52" stroke="#ECEFF1" strokeWidth="3" {...CRISP} />
      <line x1="46" y1="42" x2="29" y2="52" stroke="#ECEFF1" strokeWidth="3" {...CRISP} />
      {/* Trees */}
      <rect x="130" y="72" width="5" height="16" fill="#5D4037" {...CRISP} />
      <polygon points="125,74 132.5,50 140,74" fill="#2E7D32" {...CRISP} />
      <polygon points="127,66 132.5,46 138,66" fill="#388E3C" {...CRISP} />
      {/* Cloud */}
      <ellipse cx="140" cy="22" rx="16" ry="8" fill="white" opacity="0.8" />
      <ellipse cx="150" cy="20" rx="10" ry="6" fill="white" opacity="0.8" />
    </svg>
  );
}

// Circular Economy Island — green, recycling, compost
export function CircularIsland() {
  if (DRAFT_MODE) return <DraftIsland color="#66BB6A" label="Circular" />;
  return (
    <svg width="180" height="130" viewBox="0 0 180 130" fill="none">
      <ellipse cx="90" cy="120" rx="85" ry="12" fill="#64B5F6" opacity="0.3" />
      {/* Sand */}
      <ellipse cx="90" cy="100" rx="80" ry="22" fill="#FFE0B2" {...CRISP} />
      <ellipse cx="90" cy="96" rx="74" ry="18" fill="#FFCC80" {...CRISP} />
      {/* Lush grass */}
      <ellipse cx="90" cy="90" rx="66" ry="15" fill="#81C784" {...CRISP} />
      <ellipse cx="85" cy="86" rx="56" ry="11" fill="#66BB6A" {...CRISP} />
      {/* Small hill */}
      <ellipse cx="110" cy="78" rx="24" ry="16" fill="#4CAF50" {...CRISP} />
      {/* Palm tree */}
      <rect x="55" y="40" width="6" height="48" rx="2" fill="#8D6E63" {...CRISP} />
      <path d="M58,40 Q40,30 30,38" stroke="#4CAF50" strokeWidth="4" fill="none" {...CRISP} />
      <path d="M58,40 Q75,28 85,35" stroke="#43A047" strokeWidth="4" fill="none" {...CRISP} />
      <path d="M58,38 Q50,22 42,28" stroke="#66BB6A" strokeWidth="3" fill="none" {...CRISP} />
      <path d="M58,38 Q68,22 78,28" stroke="#388E3C" strokeWidth="3" fill="none" {...CRISP} />
      {/* Recycle arrows circle */}
      <circle cx="115" cy="70" r="10" fill="none" stroke="#2E7D32" strokeWidth="2.5" {...CRISP} />
      <polygon points="115,60 118,64 112,64" fill="#2E7D32" {...CRISP} />
      <polygon points="124,73 120,76 122,70" fill="#2E7D32" {...CRISP} />
      <polygon points="106,73 110,70 108,76" fill="#2E7D32" {...CRISP} />
      {/* Compost bin */}
      <rect x="130" y="78" width="14" height="12" rx="2" fill="#795548" {...CRISP} />
      <rect x="131" y="76" width="12" height="3" rx="1" fill="#5D4037" {...CRISP} />
      {/* Flowers */}
      <circle cx="80" cy="82" r="3" fill="#F06292" {...CRISP} />
      <circle cx="95" cy="80" r="3" fill="#FFD54F" {...CRISP} />
      <circle cx="72" cy="86" r="2.5" fill="#CE93D8" {...CRISP} />
    </svg>
  );
}

// Small decorative island (for background scenery)
export function TinyIsland() {
  if (DRAFT_MODE) return <DraftIsland color="#81C784" label="" width={60} height={40} />;
  return (
    <svg width="60" height="40" viewBox="0 0 60 40" fill="none">
      <ellipse cx="30" cy="32" rx="26" ry="8" fill="#FFE0B2" {...CRISP} />
      <ellipse cx="30" cy="30" rx="22" ry="6" fill="#FFCC80" {...CRISP} />
      <ellipse cx="28" cy="28" rx="16" ry="4" fill="#81C784" {...CRISP} />
      <rect x="27" y="12" width="3" height="16" fill="#8D6E63" {...CRISP} />
      <path d="M28.5,12 Q18,6 14,12" stroke="#4CAF50" strokeWidth="3" fill="none" />
      <path d="M28.5,12 Q38,4 44,10" stroke="#43A047" strokeWidth="3" fill="none" />
    </svg>
  );
}

// Sailboat decoration
export function Sailboat() {
  if (DRAFT_MODE) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <polygon points="12,30 28,30 20,14" fill="#90A4AE" />
        <line x1="20" y1="14" x2="20" y2="30" stroke="#795548" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      {/* Hull */}
      <path d="M8,30 Q20,36 32,30 L28,26 L12,26 Z" fill="#5D4037" {...CRISP} />
      {/* Sail */}
      <polygon points="20,6 20,26 8,24" fill="white" {...CRISP} />
      <polygon points="20,8 20,26 30,24" fill="#ECEFF1" {...CRISP} />
      {/* Mast */}
      <line x1="20" y1="6" x2="20" y2="26" stroke="#795548" strokeWidth="1.5" />
    </svg>
  );
}
