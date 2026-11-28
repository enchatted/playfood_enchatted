const EU_EMBLEM_BY_LOCALE = {
  en: '/assets/eu-cofunded-en.png',
  nl: '/assets/eu-cofunded-nl.png',
  el: '/assets/eu-cofunded-el.png',
  pt: '/assets/eu-cofunded-pt.png',
};

export function getEuEmblemSrc(language = 'en') {
  const locale = language.split('-')[0].toLowerCase();
  return EU_EMBLEM_BY_LOCALE[locale] || EU_EMBLEM_BY_LOCALE.en;
}
