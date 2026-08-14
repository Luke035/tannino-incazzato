'use client';

import { useTranslations } from 'next-intl';
import { Mascot } from '@/components/Mascot';

/**
 * The panel's landing screen: an empty content area with a welcome, no
 * features. The layout carries the navigation and the chrome; this is only the
 * first thing an admin sees inside it.
 */
export default function AdminOverviewPage() {
  const t = useTranslations('admin');

  return (
    <div className="card-rounded soft-shadow bg-surface p-8 sm:p-12 max-w-2xl">
      <div className="flex items-center gap-4 mb-4">
        <Mascot mood="happy" size={56} />
        <h1
          className="font-extrabold text-ink"
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem' }}
        >
          {t('welcomeTitle')}
        </h1>
      </div>
      <p className="text-muted" style={{ fontFamily: 'var(--font-sans)' }}>
        {t('welcomeBody')}
      </p>
    </div>
  );
}
