'use client';

import React from 'react';
import { useI18n } from '../lib/i18n';

interface LanguageSwitchProps {
  className?: string;
}

export function LanguageSwitch({ className = '' }: LanguageSwitchProps): React.JSX.Element {
  const { locale, setLocale } = useI18n();

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center rounded bg-nyx-card border border-nyx-border p-0.5 text-xs ${className}`}
    >
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={`px-2 py-1 rounded transition text-[11px] font-medium ${
          locale === 'en'
            ? 'bg-nyx-primary/30 text-nyx-highlight font-semibold'
            : 'text-nyx-muted hover:text-nyx-text'
        }`}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale('pt-BR')}
        className={`px-2 py-1 rounded transition text-[11px] font-medium ${
          locale === 'pt-BR'
            ? 'bg-nyx-primary/30 text-nyx-highlight font-semibold'
            : 'text-nyx-muted hover:text-nyx-text'
        }`}
        aria-pressed={locale === 'pt-BR'}
      >
        PT
      </button>
    </div>
  );
}
