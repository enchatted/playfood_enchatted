import React from 'react';

// Temporary placeholder for not-yet-built games (Phase 3 replaces each).
export default function ComingSoon({ title, onComplete }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 18,
      background: 'var(--pf-bg)', color: 'var(--pf-text)',
      fontFamily: 'var(--pf-font-body)',
    }}>
      <h2 style={{ fontFamily: 'var(--pf-font-head)' }}>{title}</h2>
      <p>🚧 Coming soon. Placeholder game.</p>
      <button
        onClick={() => onComplete(60, true)}
        style={{ padding: '10px 24px', fontSize: 16, cursor: 'pointer',
                 border: 'none', borderRadius: 12, color: '#fff',
                 background: 'var(--pf-grad-green)' }}>
        Complete (dev)
      </button>
    </div>
  );
}
