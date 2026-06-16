import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from '../locales/en.json';
import pl from '../locales/pl.json';
import mantrasPl from '../locales/mantras.pl.json';
import de from '../locales/de.json';
import it from '../locales/it.json';
import fr from '../locales/fr.json';
import ca from '../locales/ca.json';
import zh from '../locales/zh.json';
import pt from '../locales/pt.json';
import es from '../locales/es.json';
import hi from '../locales/hi.json';
import ar from '../locales/ar.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'ca', label: 'Català' },
  { code: 'zh', label: '中文' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ar', label: 'العربية' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

function detectLocale(): string {
  try {
    const locale = Localization.getLocales()[0]?.languageCode ?? 'en';
    const supported = SUPPORTED_LANGUAGES.map(l => l.code);
    return supported.includes(locale as LanguageCode) ? locale : 'en';
  } catch {
    return 'en';
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en, mantras: {} },
      pl: { translation: pl, mantras: mantrasPl },
      de: { translation: de },
      it: { translation: it },
      fr: { translation: fr },
      ca: { translation: ca },
      zh: { translation: zh },
      pt: { translation: pt },
      es: { translation: es },
      hi: { translation: hi },
      ar: { translation: ar },
    },
    lng: detectLocale(),
    fallbackLng: 'en',
    ns: ['translation', 'mantras'],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
  });

export default i18n;
