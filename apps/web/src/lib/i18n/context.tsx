'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Locale, TranslationDictionary } from './types';
import { en } from './dictionaries/en';
import { ptBR } from './dictionaries/pt-br';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationDictionary;
  formatMoney: (minorUnits: string | number | bigint, currency?: string) => string;
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

  const formatMoney = (minorUnits: string | number | bigint, currency = 'USD'): string => {
    const intlLocale = locale === 'pt-BR' ? 'pt-BR' : 'en-US';
    const formatter = new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
    });
    const amount =
      typeof minorUnits === 'number'
        ? Number.isSafeInteger(minorUnits)
          ? BigInt(minorUnits)
          : (() => {
              throw new Error('Monetary values provided as numbers must be safe integers');
            })()
        : BigInt(minorUnits);
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const scale = 10n ** BigInt(fractionDigits);
    const absoluteAmount = amount < 0n ? -amount : amount;
    const majorUnits = absoluteAmount / scale;
    const fraction = (absoluteAmount % scale).toString().padStart(fractionDigits, '0');
    const formattedMajor = new Intl.NumberFormat(intlLocale, {
      maximumFractionDigits: 0,
    }).format(majorUnits);
    const digitFormatter = new Intl.NumberFormat(intlLocale, { useGrouping: false });
    const formattedFraction = [...fraction]
      .map(digit => digitFormatter.format(Number(digit)))
      .join('');

    return formatter
      .formatToParts(amount < 0n ? -1 : 0)
      .map(part => {
        if (part.type === 'integer') return formattedMajor;
        if (part.type === 'fraction') return formattedFraction;
        return part.value;
      })
      .join('');
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
