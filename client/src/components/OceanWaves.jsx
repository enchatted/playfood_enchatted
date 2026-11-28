import React from 'react';
import { DRAFT_MODE } from '../config/draftMode.js';
import { BRAND, WORLD_ART } from '../styles/brandColors.js';

/**
 * OceanWaves — Animated ocean background with 3-layer parallax waves.
 * Smooth flowing CSS waves over a sky-to-ocean gradient.
 *
 * Phase I.C: sky + wave + ocean colors sourced from WORLD_ART / BRAND
 * (brand-derived tonal scale of --pf-blue, warm-cream sky horizon).
 */

const WAVES = [
  { color: WORLD_ART.oceanMid,       opacity: 0.5, height: 160, speed: 15, offset: 0, y: 30 },
  { color: WORLD_ART.oceanWaveMid,   opacity: 0.6, height: 140, speed: 10, offset: 0, y: 15 },
  { color: WORLD_ART.oceanWaveLight, opacity: 0.7, height: 120, speed: 7,  offset: 0, y: 0 },
];

function WaveLayer({ color, opacity, height, speed, index }) {
  const d = 'M0,40 C150,80 350,0 500,40 C650,80 850,0 1000,40 C1150,80 1350,0 1500,40 C1650,80 1850,0 2000,40 L2000,120 L0,120 Z';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: index * 15,
        left: 0,
        width: '100%',
        height,
        zIndex: 2 + index,
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox="0 0 2000 120"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '200%',
          height: '100%',
          animation: `wave ${speed}s linear infinite`,
          animationDirection: index % 2 === 0 ? 'normal' : 'reverse',
        }}
      >
        <path d={d} fill={color} opacity={opacity} />
      </svg>
    </div>
  );
}

export default function OceanWaves({ children, style }) {
  if (DRAFT_MODE) {
    return (
      <div style={{ ...containerStyle, ...style }}>
        {/* DRAFT: simple static gradient background, no SVG wave animations */}
        <div style={draftBgStyle} />
        <div style={contentStyle}>{children}</div>
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, ...style }}>
      {/* Sky gradient */}
      <div style={skyStyle} />

      {/* Content — flex column so children can use flex:1 */}
      <div style={contentStyle}>{children}</div>

      {/* Animated wave layers */}
      {WAVES.map((w, i) => (
        <WaveLayer key={i} index={i} {...w} />
      ))}

      {/* Solid ocean fill at the very bottom */}
      <div style={oceanStyle} />
    </div>
  );
}

const containerStyle = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const skyStyle = {
  position: 'absolute',
  inset: 0,
  // Cream horizon → blue-soft → brand-blue wave tones (top to bottom).
  // Brand-aligned warm sky direction; revertable to Material blue if review fails.
  background: `linear-gradient(180deg, ${BRAND.cream} 0%, ${BRAND.blueSoft} 35%, ${WORLD_ART.oceanWaveLight} 65%, ${WORLD_ART.oceanWaveMid} 100%)`,
};

const contentStyle = {
  position: 'relative',
  zIndex: 10,
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const oceanStyle = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  width: '100%',
  height: 60,
  background: `linear-gradient(180deg, ${WORLD_ART.oceanMid} 0%, ${WORLD_ART.oceanDeep} 100%)`,
  zIndex: 5,
};

// DRAFT_MODE: static cream-to-deep brand gradient (no SVG wave layers).
const draftBgStyle = {
  position: 'absolute',
  inset: 0,
  background: `linear-gradient(180deg, ${BRAND.cream} 0%, ${BRAND.blueSoft} 35%, ${BRAND.blue} 75%, ${WORLD_ART.oceanDeep} 100%)`,
};
