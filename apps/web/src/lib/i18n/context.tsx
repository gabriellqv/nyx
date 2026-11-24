'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Locale, TranslationDictionary } from './types';
import { en } from './dictionaries/en';
import { ptBR } from './dictionaries/pt-br';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationDictionary;
  formatMoney: (cents: number, currency?: string) => string;
}

const dictionaries: Record<Locale, TranslationDictionary> = {
  en,
  'pt-BR': ptBR,
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'nyx_locale';

export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored && (stored === 'en' || stored === 'pt-BR')) {
        setLocaleState(stored);
      } else if (
        typeof navigator !== 'undefined' &&
        navigator.language?.toLowerCase().startsWith('pt')
      ) {
        setLocaleState('pt-BR');
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, []);

  const setLocale = (newLocale: Locale): void => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      // Ignore storage errors
    }
  };

  const t = dictionaries[locale] ?? dictionaries.en;

  const formatMoney = (cents: number, currency = 'USD'): string => {
    const intlLocale = locale === 'pt-BR' ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
    }).format(cents / 100);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, formatMoney }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
