import React from 'react';
import { useTranslation } from 'react-i18next';
import { getMissionSources } from '../data/sources.js';

// Shows the verified sources behind a mini-game's content, so the facts
// the player just saw are traceable (Content Authenticity Mandate).
// Renders nothing when the mission has no registered sources.
export default function SourcePanel({ mission }) {
  const { t } = useTranslation();
  const sources = getMissionSources(mission);
  if (sources.length === 0) return null;

  return (
    <details style={styles.panel}>
      <summary style={styles.heading}>📚 {t('result.sources_title')}</summary>
      <ul style={styles.list}>
        {sources.map((src) => (
          <li key={src.id} style={styles.item}>
            <span style={styles.title}>{src.title}</span>
            <span style={styles.publisher}> · {src.publisher}</span>
            {' '}
            <a
              href={`/source.html?src=${src.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              {t('result.source_link')}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

// Clean white footer that reads as a distinct "receipt" on the cream result
// card. Island-agnostic neutral border; brand-green links (--pf-green family).
const styles = {
  panel: {
    marginTop: 20,
    maxWidth: 480,
    width: '100%',
    background: '#FFFFFF',
    border: '1.5px solid #E2DCB6',
    borderRadius: 14,
    padding: '12px 18px',
    textAlign: 'left',
    boxSizing: 'border-box',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  heading: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1A1A1A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    cursor: 'pointer',
    userSelect: 'none',
  },
  list: { margin: '8px 0 0', paddingLeft: 18 },
  item: { fontSize: 13, color: '#3A3A3A', lineHeight: 1.5 },
  link: { color: '#3C743B', fontWeight: 700, textDecoration: 'underline' },
  title: { fontWeight: 700, color: '#1A1A1A' },
  publisher: { color: '#6B6B6B' },
};
