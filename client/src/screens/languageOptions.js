// The four languages offered on the start screen.
//
// Each button shows a flag with the language name underneath, so the button
// names a language and not a country. The flags stay exactly as they were by partner
// decision: 🇧🇪 remains on Dutch because Belgium, not the Netherlands, is the
// pilot country in the grant agreement.
//
// "Dutch" is the requested wording, so it stays English while the other
// three labels are written in their own language. `nameLang` therefore records
// the language the label itself is written in, which is not the same as the
// language the button selects: a screen reader has to read "Dutch" as English.
export const LANGUAGES = [
  { code: 'en', name: 'English',   nameLang: 'en', flag: '🇬🇧', color: '#E07F37' },
  { code: 'nl', name: 'Dutch',     nameLang: 'en', flag: '🇧🇪', color: '#235FB7' },
  { code: 'el', name: 'Ελληνικά',  nameLang: 'el', flag: '🇬🇷', color: '#6DB06C' },
  { code: 'pt', name: 'Português', nameLang: 'pt', flag: '🇵🇹', color: '#D36244' },
];
