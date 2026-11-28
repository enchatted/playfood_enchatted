import { describe, expect, it } from 'vitest';
import {
  getBoundaryLabelLayout,
  getChoiceAffectedBoundaryLabels,
  getMissionControlLinks,
  renderChoiceFeedback,
  renderChoiceModal,
  updatePlanetaryTechnicians,
} from './planetaryBoundariesRenderer.js';

function recordingContext() {
  const target = { texts: [] };
  return new Proxy(target, {
    get(object, property) {
      if (property === 'measureText') return (text) => ({ width: String(text).length * 7 });
      if (property === 'fillText') {
        return (text, x, y) => object.texts.push({ text: String(text), x, y });
      }
      if (property in object) return object[property];
      return () => {};
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  });
}

describe('Planetary Boundaries mission-control layout', () => {
  it('connects every decision console to the shared planetary hub', () => {
    const state = {
      ringCenterPx: { x: 624, y: 320 },
      consoles: [
        { key: 'food', chosen: false, tiles: [{ col: 9, row: 2 }] },
        { key: 'energy', chosen: true, tiles: [{ col: 3, row: 6 }] },
        { key: 'transport', chosen: false, tiles: [{ col: 15, row: 6 }] },
        { key: 'materials', chosen: false, tiles: [{ col: 9, row: 11 }] },
      ],
    };

    expect(getMissionControlLinks(state)).toEqual([
      { key: 'food', chosen: false, x: 624, y: 192 },
      { key: 'energy', chosen: true, x: 432, y: 320 },
      { key: 'transport', chosen: false, x: 816, y: 320 },
      { key: 'materials', chosen: false, x: 624, y: 480 },
    ]);
  });
});

describe('Planetary observation technicians', () => {
  it('patrols inside its protected lane and turns around at the edge', () => {
    const state = {
      technicians: [{ x: 2, minCol: 2, maxCol: 3, speed: 1, direction: 1 }],
    };

    updatePlanetaryTechnicians(state, 0.5);
    expect(state.technicians[0].x).toBe(2.5);
    updatePlanetaryTechnicians(state, 1);
    expect(state.technicians[0]).toMatchObject({ x: 3, direction: -1 });
  });
});

describe('Planetary boundary ring labels', () => {
  it('keeps every label inside the ring instead of colliding with the consoles', () => {
    const center = { x: 624, y: 320 };
    const boundaries = [
      { key: 'climate', short: 'Κλίμα' },
      { key: 'freshwater', short: 'Γλυκό νερό' },
      { key: 'biogeochemical', short: 'Λιπάσματα' },
    ];

    const labels = getBoundaryLabelLayout(center, boundaries);

    expect(labels).toHaveLength(3);
    for (const label of labels) {
      expect(Math.hypot(label.x - center.x, label.y - center.y)).toBeLessThan(100);
    }
    expect(labels[1].lines).toEqual(['Γλυκό', 'νερό']);
  });
});

describe('Planetary decision cards', () => {
  it('shows the translated limits affected by an option without exposing hidden score values', () => {
    const boundaries = [
      { key: 'climate', short: 'Κλίμα' },
      { key: 'land', short: 'Γη' },
      { key: 'freshwater', short: 'Γλυκό νερό' },
    ];
    const option = { effects: { climate: -8, freshwater: -10 } };

    expect(getChoiceAffectedBoundaryLabels(boundaries, option)).toEqual(['Κλίμα', 'Γλυκό νερό']);
  });

  it('draws NO «Affects» line on the card (it comes after the answer)', () => {
    const ctx = recordingContext();
    renderChoiceModal(ctx, {
      choice: { consoleKey: 'transport', sel: 0 },
      boundaries: [
        { key: 'climate', short: 'Κλίμα' },
        { key: 'aerosols', short: 'Σκόνη' },
      ],
      affectsLabel: 'Επηρεάζει:',
      optionLabelTemplate: 'Επιλογή __L__',
      selectedLabel: 'ΕΠΙΛΕΓΜΕΝΟ',
      chooseHint: '← / → για επιλογή',
      consoles: [{
        key: 'transport', emoji: '🚗', prompt: 'Πώς θα μετακινούνται οι άνθρωποι;',
        options: [
          { desc: 'Με αυτοκίνητο για κάθε διαδρομή.', effects: { climate: 8, aerosols: 24 } },
          { desc: 'Με τα πόδια, με ποδήλατο και με λεωφορείο.', effects: { climate: -10, aerosols: -6 } },
        ],
      }],
    });

    const texts = ctx.texts.map(({ text }) => text);
    expect(texts.some((t) => t.startsWith('Επηρεάζει:'))).toBe(false);
    expect(texts.some((t) => t.includes('Κλίμα') || t.includes('Σκόνη'))).toBe(false);
    expect(texts).toContain('Με αυτοκίνητο για κάθε διαδρομή.');
  });
});

describe('the choice card without a preselected option', () => {
  const base = (choice) => ({
    choice,
    boundaries: [{ key: 'climate', short: 'Κλίμα' }],
    affectsLabel: 'Επηρεάζει:', optionLabelTemplate: 'Επιλογή __L__', selectedLabel: 'ΕΠΙΛΕΓΜΕΝΟ',
    chooseHint: 'HINT', chooseFirst: 'FIRST',
    consoles: [{ key: 'food', emoji: '🍽️', prompt: 'Q', options: [
      { id: 'B', desc: 'mindful', effects: { climate: -8 } }, { id: 'A', desc: 'impact', effects: { climate: 6 } },
    ] }],
  });
  const texts = (state) => { const ctx = recordingContext(); renderChoiceModal(ctx, state); return ctx.texts.map((t) => t.text); };

  it('draws no «selected» badge and the normal hint when nothing is picked', () => {
    const t = texts(base({ consoleKey: 'food', sel: null }));
    expect(t.some((s) => s.includes('ΕΠΙΛΕΓΜΕΝΟ'))).toBe(false);
    expect(t).toContain('HINT');
    expect(t).not.toContain('FIRST');
  });

  it('after a confirm without a pick, the hint strip says «choose first»', () => {
    const t = texts(base({ consoleKey: 'food', sel: null, needsPick: true }));
    expect(t).toContain('FIRST');
    expect(t).not.toContain('HINT');
  });

  it('index 0 (the left box) is a real selection', () => {
    const ctx = recordingContext(); renderChoiceModal(ctx, base({ consoleKey: 'food', sel: 0 }));
    const badge = ctx.texts.find((x) => x.text.includes('ΕΠΙΛΕΓΜΕΝΟ'));
    const desc = ctx.texts.find((x) => x.text === 'mindful');
    expect(badge).toBeTruthy();
    expect(badge.x).toBeLessThan(640); // left half: the mindful option shown first for food
    expect(desc.x).toBeLessThan(640);
  });
});

describe('the feedback after a choice carries the «in the game» lines', () => {
  it('draws the headline and then each effect line, in order', () => {
    const ctx = recordingContext();
    renderChoiceFeedback(ctx, { choiceFeedback: {
      tone: 'improved', timer: 4, text: 'Βελτίωση! Ασφαλή όρια: 2 → 3',
      effectLines: ['Στο παιχνίδι, βελτιώθηκαν: Κλίμα · Οξίνιση ωκεανών', 'Στο παιχνίδι, χειροτέρεψαν: Χημικά'],
    } });
    const t = ctx.texts;
    expect(t.map((x) => x.text)).toEqual([
      '🌱 Βελτίωση! Ασφαλή όρια: 2 → 3',
      'Στο παιχνίδι, βελτιώθηκαν: Κλίμα · Οξίνιση ωκεανών',
      'Στο παιχνίδι, χειροτέρεψαν: Χημικά',
    ]);
    expect(t[1].y).toBeGreaterThan(t[0].y);
    expect(t[2].y).toBeGreaterThan(t[1].y);
  });

  it('still draws the one-line feedback when there are no effect lines', () => {
    const ctx = recordingContext();
    renderChoiceFeedback(ctx, { choiceFeedback: { tone: 'unchanged', timer: 2, text: 'X' } });
    expect(ctx.texts.map((x) => x.text)).toEqual(['🔎 X']);
  });
});
