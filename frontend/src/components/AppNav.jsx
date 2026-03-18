'use client';

import Link from 'next/link';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n/I18nProvider';

export function AppNav() {
  const { t } = useI18n();

  return (
    <header className="header">
      <div className="brand-wrap">
        <img
          className="brand-logo"
          src="/vrm-logo.svg"
          alt="Video Request Manager logo"
          width="44"
          height="44"
        />
        <div>
          <strong className="brand">video-request-manager</strong>
          <p className="tagline">{t('header.subtitle')}</p>
          <Link className="tracking-link" href="/tracking">{t('header.trackingLink')}</Link>
        </div>
      </div>
      <LanguageSwitcher />
    </header>
  );
}
