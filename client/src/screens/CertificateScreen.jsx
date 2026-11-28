import React from 'react';
import { useTranslation } from 'react-i18next';
import useGameStore from '../store/gameStore.js';
import { getHero } from '../overworld/heroes.js';
import { getEuEmblemSrc } from '../utils/euBranding.js';
import { balanceTwoLineLabel } from '../utils/balancedLabel.js';

/**
 * CertificateScreen — the Grand Finale reward.
 *
 * Strict retro pixel-art diploma, native to PLAYFOOD's 8/16-bit world: NO smooth curves,
 * NO border-radius, NO smooth gradients. Everything is built from hard-edged blocks —
 * stepped-corner box-shadow frames, rect-grid pixel icons, a pixel hero sprite, flat
 * colours and chunky bevelled buttons. Only the hero "Μπράβο!" keeps a system serif,
 * for deliberate editorial contrast against the pixel UI. Localized UI text stays in a
 * Greek-safe sans (a Latin-only pixel font would break el/nl/pt glyphs). Print-clean.
 */

const PAL = {
  paper: '#E9D29A',     // flat parchment
  paperLite: '#F2E2B6',
  ink: '#3A2D1C',
  inkSoft: 'rgba(58,45,28,.7)',
  inkFaint: 'rgba(58,45,28,.55)',
  gold: '#C9A24B',
  goldLite: '#E7CC84',
  goldDark: '#8A6A2B',
  wood: '#6B4E2E',
  woodDeep: '#4C3826',
  outline: '#241608',   // near-black pixel outline
  cream: '#FFF8E1',
};

const ISLANDS = [
  { slug: 'growing',   accent: '#6DB06C', mark: 'crop' },     // crops
  { slug: 'local',     accent: '#E07F37', mark: 'market' },   // market items
  { slug: 'foodwaste', accent: '#D36244', mark: 'compost' },  // compost
  { slug: 'circular',  accent: '#235FB7', mark: 'circular' }, // circular pattern
];

const DATE_LOCALE = { en: 'en-GB', el: 'el-GR', nl: 'nl-NL', pt: 'pt-PT' };
const CERTIFICATE_SANS = "'Inter', system-ui, sans-serif";

export function CertificateBranding({ language, euAlt }) {
  return (
    <div className="pf-branding" style={styles.branding}>
      <div style={styles.brandRow}>
        <img
          className="pf-playfood-logo"
          src="/assets/logos/primary-logo-01.svg"
          alt="PLAYFOOD"
          style={styles.playfoodLogo}
        />
        <span className="pf-brand-divider" style={styles.brandDivider} aria-hidden="true" />
        <img
          className="pf-eu-emblem"
          src={getEuEmblemSrc(language)}
          alt={euAlt}
          style={styles.euEmblem}
        />
      </div>
      <p style={styles.footer}>
        ENCHATTED P.C. · EU Grant Agreement No. 101196354
      </p>
    </div>
  );
}

export function getCertificateIslandLabel(translate, slug) {
  return translate(
    `islands.${slug}.short_name`,
    translate(`islands.${slug}.name`, slug),
  );
}

export function getCertificateIslandLabelLines(label) {
  return balanceTwoLineLabel(label);
}

// ── Pixel-art primitives ──────────────────────────────────

// Build a stepped-corner pixel border from stacked AXIS-OFFSET box-shadows (no spread,
// no blur). Each band is a full-side rectangle pushed outward; the un-covered 4 corner
// squares produce the iconic 8-bit "notched" staircase. Inner band first (painted on top).
function steppedFrame(bands) {
  return bands
    .flatMap(({ w, c }) => [`-${w}px 0 0 ${c}`, `${w}px 0 0 ${c}`, `0 -${w}px 0 ${c}`, `0 ${w}px 0 ${c}`])
    .join(', ');
}

// Render a string-grid as crisp pixels. `palette` maps each char → colour ('.'/' ' = gap).
function PixelGrid({ grid, palette, px = 4, style }) {
  const cols = grid[0].length;
  const rows = grid.length;
  const cells = [];
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = palette[ch];
      if (fill) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />);
    });
  });
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`} width={cols * px} height={rows * px}
      shapeRendering="crispEdges" aria-hidden="true"
      style={{ display: 'block', imageRendering: 'pixelated', ...style }}
    >
      {cells}
    </svg>
  );
}

// 9×9 blocky island motifs — straight pixels only, no curves.
const ICON_GRID = {
  crop: [
    '....#....', '..#.#.#..', '.#.###.#.', '..#.#.#..', '.#.###.#.',
    '..#.#.#..', '....#....', '....#....', '....#....',
  ],
  market: [
    '.........', '..#...#..', '.#.#.#.#.', '.#######.', '.#.....#.',
    '.#.#.#.#.', '.#.....#.', '..#####..', '.........',
  ],
  compost: [
    '....#....', '...###...', '..#####..', '.#######.', '.#.#.#.#.',
    '.#.#.#.#.', '.#.....#.', '.#######.', '.........',
  ],
  circular: [
    '..#####..', '.##...##.', '##.....##', '#.......#', '#.......#',
    '#.......#', '##.....##', '.##...##.', '..#####..',
  ],
};

function PixelIcon({ kind, color, size = 36 }) {
  const grid = ICON_GRID[kind] || ICON_GRID.circular;
  return <PixelGrid grid={grid} palette={{ '#': color }} px={Math.max(2, Math.round(size / grid[0].length))} />;
}

// ── Pixel hero bust (rect grid, no curves) — H hair · S skin · E eye · T shirt. ──
const BASE_BUST = [
  '...HHHHH...', '..HHHHHHH..', '.HHHHHHHHH.', '.HHHHHHHHH.', '.HSSSSSSSH.',
  '.SSSSSSSSS.', '.SSESSSESS.', '.SSSSSSSSS.', '.SSSSSSSSS.', '..SSSSSSS..',
  '...TTTTT...', '.TTTTTTTTT.',
];

function bustGrid(style) {
  const g = BASE_BUST.map((r) => r.split(''));
  const add = (cells) => cells.forEach(([r, c]) => { if (g[r] && g[r][c] !== undefined) g[r][c] = 'H'; });
  if (style === 'pigtails') add([[3, 0], [4, 0], [5, 0], [6, 0], [3, 10], [4, 10], [5, 10], [6, 10]]);
  else if (style === 'braid') add([[5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [9, 9]]);
  else if (style === 'bob') add([[2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10]]);
  return g.map((r) => r.join(''));
}

function PixelBust({ hero, px = 9 }) {
  const palette = { H: hero.hair, S: hero.skin, E: PAL.ink, T: hero.shirt };
  return <PixelGrid grid={bustGrid(hero.style)} palette={palette} px={px} />;
}

// A flat pixel token (corner badges + star coins): square, hard outline + cream step + icon.
function PixelToken({ kind, accent, size = 60 }) {
  return (
    <span
      style={{
        width: size, height: size, boxSizing: 'border-box',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: accent, border: `3px solid ${PAL.outline}`, borderRadius: 0,
        boxShadow: steppedFrame([{ w: 3, c: PAL.cream }, { w: 6, c: PAL.outline }])
          + `, inset 3px 3px 0 rgba(255,255,255,.28), inset -3px -3px 0 rgba(0,0,0,.22)`,
        imageRendering: 'pixelated',
      }}
    >
      <PixelIcon kind={kind} color={PAL.cream} size={Math.round(size * 0.62)} />
    </span>
  );
}

// The 4-island emblem (replaces the smooth seal): a pixel-framed 2×2 of the pillar icons.
function PixelEmblem() {
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 10,
        background: PAL.woodDeep, border: `3px solid ${PAL.outline}`, borderRadius: 0,
        boxShadow: steppedFrame([{ w: 3, c: PAL.gold }, { w: 6, c: PAL.outline }]),
        imageRendering: 'pixelated',
      }}
      aria-hidden="true"
    >
      {ISLANDS.map(({ slug, accent, mark }) => (
        <PixelIcon key={slug} kind={mark} color={accent} size={26} />
      ))}
    </div>
  );
}

export default function CertificateScreen({ onNavigate }) {
  const { t, i18n } = useTranslation();
  const heroId = useGameStore((s) => s.heroId);
  const gameStars = useGameStore((s) => s.gameStars);
  const hero = getHero(heroId);

  const islandStarCount = (slug) =>
    Object.entries(gameStars)
      .filter(([k]) => k.startsWith(`${slug}:`))
      .reduce((sum, [, v]) => sum + (v || 0), 0);

  const longDate = new Date().toLocaleDateString(DATE_LOCALE[i18n.language] || 'en-GB', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const SERIF = "Georgia, 'Times New Roman', serif";
  const SANS = CERTIFICATE_SANS;

  const corners = [
    { slug: 'foodwaste', accent: '#D36244', mark: 'compost',  pos: { top: -18, left: -18 } },
    { slug: 'local',     accent: '#E07F37', mark: 'market',   pos: { top: -18, right: -18 } },
    { slug: 'growing',   accent: '#6DB06C', mark: 'crop',     pos: { bottom: -18, left: -18 } },
    { slug: 'circular',  accent: '#235FB7', mark: 'circular', pos: { bottom: -18, right: -18 } },
  ];

  return (
    <div className="pf-stage" style={styles.stage}>
      <style>{`
        @keyframes pfTokIn { 0% { opacity:0; transform: translateY(-6px); } 100% { opacity:1; } }
        .pf-corner { animation: pfTokIn .18s steps(3) both; }
        .pf-corner.c0 { animation-delay:.10s } .pf-corner.c1 { animation-delay:.18s }
        .pf-corner.c2 { animation-delay:.26s } .pf-corner.c3 { animation-delay:.34s }

        /* Pixel buttons: hard bevel + solid 3D base; press straight down (steps, no easing). */
        .pf-pixbtn { transition: none; }
        .pf-saveit:hover { background: ${PAL.goldLite} !important; }
        .pf-saveit:active { transform: translateY(6px);
          box-shadow: inset 3px 3px 0 ${PAL.goldLite}, inset -3px -3px 0 ${PAL.goldDark}, 0 0 0 3px ${PAL.outline} !important; }
        .pf-back:hover { background: ${PAL.wood} !important; }
        .pf-back:active { transform: translateY(6px);
          box-shadow: inset 3px 3px 0 rgba(255,255,255,.25), inset -3px -3px 0 rgba(0,0,0,.4), 0 0 0 3px ${PAL.outline} !important; }

        /* One clean A4: kill browser page margins, size the diploma in real mm. */
        @page { size: A4 portrait; margin: 0; }

        @media print {
          .pf-no-print { display:none !important; }
          /* index.html pins #root to 100vh with body overflow:hidden — undo it for
             print, otherwise everything past the first viewport is clipped. */
          html, body, #root { width:auto !important; height:auto !important; overflow:visible !important; background:#fff !important; }
          .pf-stage { background:#fff !important; padding:0 !important; min-height:auto !important; height:auto !important; overflow:visible !important; display:block !important; }
          /* Exactly one page: a 292mm flex box (just under 297mm so rounding cannot
             spill a blank second page) centres the card both ways. */
          .pf-scroll { height:292mm !important; padding:0 !important; margin:0 !important; gap:0 !important; display:flex !important; align-items:center !important; justify-content:center !important; }
          /* Fixed height so the diploma FILLS the page (274mm + frame/corners ≈ 287mm
             visual, leaving only the printer-safe ~5mm rim); the content spreads out
             evenly into the extra room instead of pooling white bands top and bottom. */
          .pf-card { width:186mm !important; height:274mm !important; box-shadow:${steppedFrame([{ w: 4, c: PAL.outline }, { w: 8, c: PAL.gold }, { w: 12, c: PAL.woodDeep }, { w: 16, c: PAL.outline }])} !important; }
          .pf-content { height:100% !important; justify-content:space-evenly !important; }
          .pf-branding { break-inside:avoid; page-break-inside:avoid; }
          .pf-branding img { image-rendering:auto !important; }
          .pf-stage, .pf-card, .pf-corner, .pf-tok { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        }
      `}</style>

      <div className="pf-scroll" style={styles.scroll}>
      <div className="pf-card" style={styles.card}>
        <div className="pf-grain" style={styles.grain} />

        {corners.map((c, i) => (
          <div key={c.slug} className={`pf-corner c${i} pf-tok`} aria-hidden="true"
            style={{ position: 'absolute', ...c.pos, zIndex: 3 }}>
            <PixelToken kind={c.mark} accent={c.accent} size={64} />
          </div>
        ))}

        <div className="pf-content" style={styles.content}>
          <div style={styles.emblemWrap}><PixelEmblem /></div>

          <p style={{ ...styles.eyebrow, fontFamily: SANS }}>
            {t('certificate.subtitle', 'Certificate of Completion')}
          </p>

          <h1 style={{ ...styles.bravo, fontFamily: SERIF }}>
            {t('certificate.bravo', 'Μπράβο!')}
          </h1>

          {/* Four pillar colours as hard pixel blocks — "four islands, one archipelago". */}
          <div style={styles.islandRule}>
            {ISLANDS.map((i) => (
              <span key={i.slug} style={{ ...styles.islandRuleSeg, background: i.accent }} />
            ))}
          </div>

          {/* Avatar in a square pixel-framed character window (no circle). */}
          <div style={styles.avatarWindow}>
            <div style={styles.avatarInner}><PixelBust hero={hero} px={9} /></div>
          </div>
          <p style={{ ...styles.companion, fontFamily: SANS }}>
            {t('certificate.companion', 'Your companion across the four islands')}
          </p>

          <div
            data-testid="certificate-island-grid"
            style={styles.starRow}
          >
            {ISLANDS.map(({ slug, accent, mark }) => {
              const label = getCertificateIslandLabel(t, slug);
              const labelLines = getCertificateIslandLabelLines(label);

              return (
                <div
                  key={slug}
                  data-certificate-island={slug}
                  style={styles.starCol}
                >
                  <PixelToken kind={mark} accent={accent} size={44} />
                  <span
                    data-testid="certificate-island-name"
                    data-label-lines={labelLines.length}
                    style={{ ...styles.islandName, fontFamily: SANS }}
                    aria-label={label}
                  >
                    {labelLines.map((line) => (
                      <span key={line} style={styles.islandNameLine}>{line}</span>
                    ))}
                  </span>
                  <span style={{ ...styles.starPill, fontFamily: SANS }} className="pf-tok">
                    ★ {islandStarCount(slug)}
                  </span>
                </div>
              );
            })}
          </div>

          <p style={{ ...styles.date, fontFamily: SANS }}>{longDate}</p>
          <CertificateBranding language={i18n.language} euAlt={t('eu.emblem_alt')} />
        </div>
      </div>

      <div className="pf-no-print" style={styles.actions}>
        <button type="button" className="pf-pixbtn pf-saveit" style={{ ...styles.saveBtn, fontFamily: SANS }}
          onClick={() => window.print()}>
          {t('certificate.save', 'Save It')}
        </button>
        <button type="button" className="pf-pixbtn pf-back" style={{ ...styles.backBtn, fontFamily: SANS }}
          onClick={() => onNavigate('hub', {})}>
          {t('certificate.back', 'Back to the map')}
        </button>
      </div>
      </div>
    </div>
  );
}

const styles = {
  stage: {
    width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden',
    display: 'flex', flexDirection: 'column',
    background: '#0E3A40', // flat nautical deep — no smooth gradient
    imageRendering: 'pixelated',
  },
  // margin:auto centers the content when there's room but still lets the TOP scroll into
  // view when it overflows (unlike justify-content:center, which clips the top).
  scroll: {
    margin: 'auto', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 30, padding: '48px 26px',
  },
  // Parchment + stepped-corner pixel frame (offset box-shadow bands) + hard border fallback.
  card: {
    position: 'relative',
    width: 'min(920px, 100%)',
    borderRadius: 0,
    border: `4px solid ${PAL.outline}`,
    background: PAL.paper,
    boxShadow:
      steppedFrame([{ w: 4, c: PAL.outline }, { w: 8, c: PAL.gold }, { w: 12, c: PAL.woodDeep }, { w: 16, c: PAL.outline }])
      + `, inset 0 0 0 3px ${PAL.gold}, inset 6px 6px 0 rgba(255,250,235,.35), inset -6px -6px 0 rgba(120,80,30,.18)`,
    imageRendering: 'pixelated',
  },
  // Hard-edged checkerboard "dither" for aged-paper texture (no smooth gradient).
  grain: {
    position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', opacity: 0.5,
    backgroundImage: 'repeating-conic-gradient(rgba(120,80,30,.10) 0% 25%, transparent 0% 50%)',
    backgroundSize: '6px 6px', imageRendering: 'pixelated',
  },
  content: {
    position: 'relative', zIndex: 2,
    boxSizing: 'border-box',
    padding: 'clamp(34px, 5.5vw, 60px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  },
  emblemWrap: { marginBottom: 18 },
  eyebrow: {
    margin: 0, color: PAL.inkSoft, fontSize: 14, fontWeight: 800,
    letterSpacing: '0.30em', textTransform: 'uppercase',
  },
  bravo: {
    margin: '10px 0 0', color: PAL.ink, fontWeight: 700,
    fontSize: 'clamp(52px, 10vw, 92px)', lineHeight: 1, letterSpacing: '-0.01em',
    textShadow: `4px 4px 0 ${PAL.gold}`, // hard pixel drop, no blur
  },
  // Four flat pixel blocks (no radius, hard outline).
  islandRule: { display: 'flex', gap: 0, margin: '24px 0 30px', border: `2px solid ${PAL.outline}` },
  islandRuleSeg: { width: 'clamp(20px, 5vw, 30px)', height: 12 },
  // Square pixel character window.
  avatarWindow: {
    width: 'clamp(132px, 26vw, 168px)', height: 'clamp(132px, 26vw, 168px)', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: PAL.paperLite, border: `4px solid ${PAL.outline}`, borderRadius: 0,
    boxShadow: steppedFrame([{ w: 4, c: PAL.gold }, { w: 8, c: PAL.outline }])
      + `, inset 4px 4px 0 rgba(255,255,255,.4), inset -4px -4px 0 rgba(120,80,30,.2)`,
    imageRendering: 'pixelated',
  },
  avatarInner: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  companion: {
    margin: '20px 0 0', color: PAL.inkSoft, fontSize: 16, fontWeight: 700,
    letterSpacing: '0.02em',
  },
  starRow: {
    width: 'min(680px, 100%)', boxSizing: 'border-box',
    display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    columnGap: 'clamp(10px, 2.4vw, 22px)', alignItems: 'stretch',
    margin: '32px 0 4px',
  },
  starCol: {
    minWidth: 0, display: 'grid', gridTemplateRows: '44px 2.5em auto',
    justifyItems: 'center', alignItems: 'start', rowGap: 10,
  },
  islandName: {
    width: '100%', height: '2.5em', boxSizing: 'border-box',
    display: 'grid', gridTemplateColumns: 'max-content', alignContent: 'center',
    justifyContent: 'center', justifyItems: 'center', textAlign: 'center',
    fontSize: 'clamp(11px, 1.25vw, 12.5px)', fontWeight: 800,
    letterSpacing: '0.10em', textTransform: 'uppercase',
    lineHeight: 1.25, whiteSpace: 'normal', overflowWrap: 'normal',
    color: PAL.inkSoft, // Was inkFaint, about 2.9:1 on the parchment
  },
  islandNameLine: { display: 'block', maxWidth: '100%', textAlign: 'center' },
  // Pixel "coin" pill (hard square, bevelled) holding the star count.
  starPill: {
    fontSize: 15, fontWeight: 800, color: PAL.ink, background: PAL.gold,
    padding: '4px 11px', borderRadius: 0, border: `2px solid ${PAL.outline}`,
    boxShadow: `inset 2px 2px 0 ${PAL.goldLite}, inset -2px -2px 0 ${PAL.goldDark}, 0 3px 0 ${PAL.outline}`,
  },
  date: { margin: '32px 0 0', color: PAL.ink, fontSize: 16, fontWeight: 700 },
  branding: {
    width: 'min(540px, 100%)', margin: '18px 0 0',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    fontFamily: CERTIFICATE_SANS,
  },
  brandRow: {
    width: '100%', minHeight: 62, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 'clamp(10px, 3vw, 22px)', padding: '6px clamp(8px, 2vw, 16px)',
    borderTop: `2px solid ${PAL.goldDark}`, borderBottom: `2px solid ${PAL.goldDark}`,
    background: 'rgba(255,248,225,.34)',
  },
  playfoodLogo: {
    width: 'clamp(82px, 18vw, 116px)', height: 58,
    objectFit: 'contain', display: 'block', flex: '0 1 auto', imageRendering: 'auto',
  },
  brandDivider: {
    width: 2, height: 44, flex: '0 0 2px', background: PAL.goldDark, opacity: 0.58,
  },
  euEmblem: {
    width: 'clamp(188px, 45vw, 280px)', maxWidth: '62%', height: 52,
    objectFit: 'contain', display: 'block', flex: '0 1 auto', imageRendering: 'auto',
  },
  footer: {
    margin: '7px 0 0', color: PAL.inkFaint, fontSize: 12, fontWeight: 600,
    letterSpacing: '0.04em',
  },
  actions: { display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
  // "Save It" — chunky pixel button: flat fill, hard bevel, solid 3D base (no blur).
  saveBtn: {
    appearance: 'none', cursor: 'pointer', color: PAL.ink, background: PAL.gold,
    border: 'none', borderRadius: 0,
    padding: '15px 40px', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em',
    boxShadow: `inset 3px 3px 0 ${PAL.goldLite}, inset -3px -3px 0 ${PAL.goldDark}, 0 6px 0 ${PAL.outline}, 0 6px 0 3px ${PAL.outline}`,
    imageRendering: 'pixelated',
  },
  backBtn: {
    appearance: 'none', cursor: 'pointer', color: PAL.cream, background: PAL.woodDeep,
    border: 'none', borderRadius: 0,
    padding: '15px 28px', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em',
    boxShadow: `inset 3px 3px 0 rgba(255,255,255,.22), inset -3px -3px 0 rgba(0,0,0,.4), 0 6px 0 ${PAL.outline}, 0 6px 0 3px ${PAL.outline}`,
    imageRendering: 'pixelated',
  },
};
