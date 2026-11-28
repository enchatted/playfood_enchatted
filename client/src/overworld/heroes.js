// Playable heroes (gender-inclusive character select).
// Pure data, no canvas: imported by BOTH gameStore (random default) and
// tileAtlas (sprite drawing) — keeping it separate breaks the import cycle.
//
// Design rules:
// - 4 heroes: 2 girls + 2 boys, four different skin tones.
// - Gender reads from the hair SILHOUETTE (pigtails / braid vs bob / short),
//   never from outfit color — no «pink = girl» coding. Outfits use brand colors.
// - No proper names: ids are internal only.

import { BRAND } from '../styles/brandColors.js';

export const HEROES = [
  {
    id: 'pigtails',          // girl — two bunches sticking out past the head
    style: 'pigtails',
    skin: '#C68642',
    hair: '#3E2723',
    shirt: BRAND.green,      // #6DB06C
    shirtHi: '#8FC78E',
    legs: '#5D4037',
    shoes: BRAND.red,        // #D36244
    shoesHi: '#E08B74',
    pack: '#E65100',
    packHi: '#EF6C00',
  },
  {
    id: 'braid',             // girl — single long plait over the shoulder
    style: 'braid',
    skin: '#FFDBAC',
    hair: '#B5651D',
    shirt: BRAND.blue,       // #235FB7
    shirtHi: '#4F7FD0',
    legs: '#37474F',
    shoes: BRAND.orange,     // #E07F37
    shoesHi: '#ECA066',
    // Green pack, not orange: the auburn plait hangs over it in the UP view
    // and needs the contrast to stay readable.
    pack: '#388E3C',
    packHi: '#66BB6A',
  },
  {
    id: 'short',             // boy — close-cropped hair
    style: 'short',
    skin: '#8D5524',
    hair: '#1A1A1A',
    shirt: BRAND.orange,     // #E07F37
    shirtHi: '#ECA066',
    legs: '#3E2723',
    shoes: BRAND.green,      // #6DB06C
    shoesHi: '#8FC78E',
    pack: '#235FB7',
    packHi: '#4F7FD0',
  },
  {
    id: 'bob',               // boy — shaggy mop-top (καρέ with a choppy hem)
    style: 'bob',
    skin: '#E0AC69',
    hair: '#C68B3B',         // sandy blond — the brighter gold read «girl» in the blind test
    shirt: BRAND.purple,     // #533F8B
    shirtHi: '#7A63B8',
    legs: '#5D4037',
    shoes: '#F9A825',
    shoesHi: '#FDD835',
    pack: '#E65100',
    packHi: '#EF6C00',
  },
];

export const HERO_IDS = HEROES.map((h) => h.id);

export function getHero(heroId) {
  return HEROES.find((h) => h.id === heroId) || HEROES[0];
}

// First-run default is RANDOM: a fixed default would silently break the
// gender-inclusive rule for every player who never opens the picker.
export function randomHeroId() {
  return HERO_IDS[Math.floor(Math.random() * HERO_IDS.length)];
}
