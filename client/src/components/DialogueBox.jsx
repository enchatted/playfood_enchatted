import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

function formatDialogueText(text) {
  return text.replace(/([.!?;])\s+/g, '$1\n');
}

/**
 * RPG-style speech bubble — floats above the boat with a triangular tail.
 * Typewriter text with avatar portrait.
 *
 * Props:
 *   lines      — array of strings to display sequentially
 *   avatar     — emoji for the speaker portrait (default compass)
 *   onComplete — called when all lines have been dismissed
 */
export default function DialogueBox({ lines, avatar = '\uD83E\uDDED', onComplete }) {
  const { t } = useTranslation();
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [popIn, setPopIn] = useState(false);

  const currentLine = lines[lineIndex] || '';
  const displayedText = formatDialogueText(currentLine.slice(0, charIndex));
  const lineFullyRevealed = charIndex >= currentLine.length;

  // Pop-in animation on mount
  useEffect(() => {
    requestAnimationFrame(() => setPopIn(true));
  }, []);

  // Typewriter effect — 30ms per character
  useEffect(() => {
    if (lineFullyRevealed) return;
    const timer = setTimeout(() => setCharIndex((c) => c + 1), 30);
    return () => clearTimeout(timer);
  }, [charIndex, lineFullyRevealed]);

  const handleAdvance = useCallback(() => {
    if (!lineFullyRevealed) {
      setCharIndex(currentLine.length);
    } else if (lineIndex < lines.length - 1) {
      setLineIndex((i) => i + 1);
      setCharIndex(0);
    } else {
      onComplete();
    }
  }, [lineFullyRevealed, lineIndex, lines.length, currentLine.length, onComplete]);

  // Enter / Space to advance
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return; // OS auto-repeat must not machine-gun through the lines
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        handleAdvance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleAdvance]);

  const bubbleStyle = {
    ...styles.bubble,
    transform: popIn ? 'translateX(-50%) scale(1)' : 'translateX(-50%) scale(0.7)',
    opacity: popIn ? 1 : 0,
  };

  return (
    <div style={styles.container} onClick={handleAdvance}>
      <div style={bubbleStyle}>
        <div style={styles.avatar}>{avatar}</div>
        <div style={styles.textArea}>
          <p style={styles.text}>
            {displayedText}
            {!lineFullyRevealed && <span style={styles.cursor}>|</span>}
          </p>
          {lineFullyRevealed && (
            <span style={styles.hint}>
              {lineIndex < lines.length - 1 ? t('dialogue.next') : t('dialogue.done')}
            </span>
          )}
        </div>
        {/* Speech bubble tail */}
        <div style={styles.tail} />
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    inset: 0,
    zIndex: 100,
    pointerEvents: 'auto',
    cursor: 'pointer',
  },
  bubble: {
    position: 'absolute',
    left: '50%',
    bottom: '65%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    background: 'rgba(83,63,139,0.94)', // var(--pf-purple) decomposed
    backdropFilter: 'blur(10px)',
    border: '2px solid rgba(255,255,255,0.25)',
    borderRadius: 16,
    padding: '16px 22px',
    maxWidth: 420,
    minWidth: 300,
    boxSizing: 'border-box',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset',
    transition: 'transform 0.25s ease-out, opacity 0.25s ease-out',
    transformOrigin: 'center bottom',
  },
  tail: {
    position: 'absolute',
    bottom: -12,
    left: '50%',
    marginLeft: -10,
    width: 0,
    height: 0,
    borderLeft: '10px solid transparent',
    borderRight: '10px solid transparent',
    borderTop: '12px solid rgba(83,63,139,0.94)', // var(--pf-purple) decomposed (matches bubble bg)
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))',
  },
  avatar: {
    fontSize: 40,
    lineHeight: 1,
    flexShrink: 0,
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
  },
  textArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: 40,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontFamily: "'Fredoka', sans-serif",
    fontWeight: 500,
    lineHeight: 1.5,
    margin: 0,
    whiteSpace: 'pre-line',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  cursor: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 300,
  },
  hint: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: "'Fredoka', sans-serif",
    fontWeight: 700,
    marginTop: 6,
    textShadow: '0 1px 2px rgba(0,0,0,0.45)',
  },
};
