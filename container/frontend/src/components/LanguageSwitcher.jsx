'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="locale-switcher" aria-label="language switcher">
      <button
        className={locale === 'pt-BR' ? 'active' : ''}
        onClick={() => setLocale('pt-BR')}
        type="button"
      >
        🇧🇷 PT-BR
      </button>
      <button
        className={locale === 'en-US' ? 'active' : ''}
        onClick={() => setLocale('en-US')}
        type="button"
      >
        🇺🇸 EN-US
      </button>
    </div>
  );
}
