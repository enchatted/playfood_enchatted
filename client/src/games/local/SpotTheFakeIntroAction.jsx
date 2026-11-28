import React from 'react';

export default function SpotTheFakeIntroAction({ label, onStart }) {
  return <button type="button" className="spot-intro-start" onClick={onStart}>{label}</button>;
}
