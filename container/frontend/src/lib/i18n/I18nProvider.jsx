'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { messages } from '@/lib/i18n/messages';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'pt-BR');

  useEffect(() => {
    const persisted = localStorage.getItem('vrm_locale');
    if (persisted && messages[persisted]) {
      setLocale(persisted);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('vrm_locale', locale);
  }, [locale]);

  const value = useMemo(() => {
    const t = (key) => messages[locale]?.[key] || key;
    return { locale, setLocale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}
