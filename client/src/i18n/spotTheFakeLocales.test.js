import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import el from './locales/el.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';

const LOCALES = { en, el, nl, pt };

const CLAIM_TERMINOLOGY = {
  en: {
    stage: 'Claim',
    label: 'Front-of-pack claim',
    hint: 'Read the claim first, then check the evidence on the back.',
    step2: 'Decide whether the claim is Supported by evidence ✓ or Needs evidence ? after checking the label.',
    outdatedTerm: /\bpromise(?:s)?\b/i,
  },
  el: {
    stage: 'Ισχυρισμός',
    label: 'Ισχυρισμός στη συσκευασία',
    hint: 'Διάβασε τον ισχυρισμό μπροστά και μετά έλεγξε τα στοιχεία πίσω.',
    step2: 'Αφού ελέγξεις την ετικέτα, αποφάσισε αν ο ισχυρισμός Υποστηρίζεται από στοιχεία ✓ ή Χρειάζεται στοιχεία ?.',
    outdatedTerm: /υπόσχεσ/i,
  },
  nl: {
    stage: 'Bewering',
    label: 'Bewering op de voorkant',
    hint: 'Lees eerst de bewering en controleer daarna het bewijs achterop.',
    step2: 'Beslis na het lezen van het etiket of de bewering Ondersteund door bewijs ✓ is of Bewijs nodig heeft ?.',
    outdatedTerm: /belofte/i,
  },
  pt: {
    stage: 'Alegação',
    label: 'Alegação na frente da embalagem',
    hint: 'Lê primeiro a alegação e depois verifica as provas no verso.',
    step2: 'Depois de verificares o rótulo, decide se a alegação é Sustentada por provas ✓ ou Precisa de provas ?.',
    outdatedTerm: /promessa/i,
  },
};

describe('Spot the Fake in-room guide translations', () => {
  it.each([
    ['en', 'No added sugar!'],
    ['el', 'Χωρίς πρόσθετη ζάχαρη!'],
    ['nl', 'Zonder toegevoegde suikers!'],
    ['pt', 'Sem açúcares adicionados!'],
  ])('%s uses the precise no-added-sugar claim', (localeName, expectedClaim) => {
    expect(LOCALES[localeName].spotthefake.front_cookies).toBe(expectedClaim);
  });

  it.each([
    ['en', "It says 'no added sugar', but that does not mean sugar-free: the grape juice and raisins are full of sugars."],
    ['el', 'Λέει «χωρίς πρόσθετη ζάχαρη», αλλά αυτό δεν σημαίνει χωρίς ζάχαρη: ο χυμός σταφυλιού και οι σταφίδες έχουν πολλά σάκχαρα.'],
    ['nl', 'Er staat ‘zonder toegevoegde suikers’, maar dat betekent niet suikervrij: het druivensap en de rozijnen zitten vol suikers.'],
    ['pt', 'Diz «sem açúcares adicionados», mas isso não quer dizer sem açúcar: o sumo de uva e as passas têm muitos açúcares.'],
  ])('%s keeps the no-added-sugar warning consistent with the package', (
    localeName,
    expectedWarning,
  ) => {
    expect(LOCALES[localeName].spotthefake.redflag_noadded).toBe(expectedWarning);
  });

  it.each(Object.entries(LOCALES))('%s names the guide and gives a short label hint', (
    localeName,
    locale,
  ) => {
    expect(locale.spotthefake?.guide_name, `${localeName}: guide_name`).toBeTruthy();
    expect(locale.spotthefake?.guide_hint, `${localeName}: guide_hint`).toBeTruthy();
    expect(locale.spotthefake.guide_hint.length).toBeLessThanOrEqual(80);
  });

  it.each(Object.entries(LOCALES))('%s consistently calls packaging text a claim', (
    localeName,
    locale,
  ) => {
    const expected = CLAIM_TERMINOLOGY[localeName];
    const copy = locale.spotthefake;

    expect(copy.stage_promise).toBe(expected.stage);
    expect(copy.evidence_promise_label).toBe(expected.label);
    expect(copy.guide_hint).toBe(expected.hint);
    expect(locale.missionIntro.spotthefake.step2).toBe(expected.step2);
    expect(JSON.stringify({ copy, intro: locale.missionIntro.spotthefake }))
      .not.toMatch(expected.outdatedTerm);
  });
});
