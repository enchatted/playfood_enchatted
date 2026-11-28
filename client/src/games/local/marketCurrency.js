const LOCALES = { en: 'en-IE', el: 'el-GR', nl: 'nl-BE', pt: 'pt-PT' };

export function formatMarketMoney(value, language = 'en') {
  const locale = LOCALES[String(language).split('-')[0]] || LOCALES.en;
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}
