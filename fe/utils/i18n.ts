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
import csb from '../locales/csb.json';
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
  { code: 'csb', label: 'Kaszëbsczi' },
  { code: 'zh', label: '中文' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ar', label: 'العربية' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const LANGUAGE_ALIASES: Partial<Record<string, LanguageCode>> = {
  cat: 'ca',
};

export function normalizeLanguageCode(
  code?: string | null,
): LanguageCode | null {
  if (!code) return null;
  const normalized = code.toLowerCase().replace('_', '-');
  const base = normalized.split('-')[0];
  const candidate =
    LANGUAGE_ALIASES[normalized] ?? LANGUAGE_ALIASES[base] ?? base;
  return SUPPORTED_LANGUAGES.some((language) => language.code === candidate)
    ? (candidate as LanguageCode)
    : null;
}

function detectLocale(): string {
  try {
    return (
      normalizeLanguageCode(Localization.getLocales()[0]?.languageCode) ?? 'en'
    );
  } catch {
    return 'en';
  }
}

// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en, mantras: {} },
    pl: { translation: pl, mantras: mantrasPl },
    de: { translation: de },
    it: { translation: it },
    fr: { translation: fr },
    ca: { translation: ca },
    cat: { translation: ca },
    csb: { translation: csb },
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
