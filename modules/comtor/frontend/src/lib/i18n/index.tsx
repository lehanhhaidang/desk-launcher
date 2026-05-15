
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Locale, TranslationSet } from './types';
import { vi } from './vi';
import { en } from './en';
import { ja } from './ja';

const translations: Record<Locale, TranslationSet> = { vi, en, ja };

interface I18nContextType {
  locale: Locale;
  t: TranslationSet;
  setLocale: (locale: Locale) => void;
  locales: { code: Locale; label: string; flag: string }[];
}

const I18nContext = createContext<I18nContextType | null>(null);

const LOCALE_KEY = 'vcomtor_locale';

const availableLocales: { code: Locale; label: string; flag: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

function getInitialLocale(): Locale {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && stored in translations) return stored as Locale;
  }
  return 'vi';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALE_KEY, newLocale);
    }
  }, []);

  const value = useMemo(() => ({
    locale,
    t: translations[locale],
    setLocale,
    locales: availableLocales,
  }), [locale, setLocale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

/** Get translations without context (for server components) */
export function getTranslations(locale: Locale = 'vi'): TranslationSet {
  return translations[locale];
}

export { type Locale, type TranslationSet } from './types';
