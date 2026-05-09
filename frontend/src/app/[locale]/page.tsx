'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Filter } from '@/types';

export default function SetupPage() {
  const t = useTranslations('setup');
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('both');

  const start = () => {
    router.push(`/game?filter=${filter}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center gap-12 px-8 py-16">

        {/* Hero */}
        <div className="text-center max-w-xl">
          <p
            className="text-crimson font-semibold mb-4 tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', letterSpacing: '0.22em' }}
          >
            {t('subtitle')}
          </p>
          <h1
            className="font-extrabold text-charcoal leading-none tracking-tight"
            style={{ fontFamily: 'var(--font-bricolage)', fontSize: 'clamp(3rem, 8vw, 5.5rem)', lineHeight: '0.95' }}
          >
            {t('title')}
          </h1>
        </div>

        {/* Filter */}
        <div className="flex flex-col items-center gap-3">
          <p
            className="text-muted text-xs font-medium uppercase tracking-widest"
            style={{ fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.18em' }}
          >
            {t('filterLabel')}
          </p>
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(['both', 'DOCG', 'DOC'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-6 py-2.5 text-sm font-semibold transition-all border-r last:border-r-0 border-border ${
                  filter === f
                    ? 'bg-charcoal text-white'
                    : 'bg-white text-charcoal hover:bg-surface'
                }`}
                style={{ fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.03em' }}
              >
                {f === 'both' ? t('filterBoth') : f === 'DOCG' ? t('filterDocg') : t('filterDoc')}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          data-testid="start-button"
          onClick={start}
          className="px-12 py-4 bg-crimson text-white font-bold rounded-lg hover:bg-crimson-dark transition-colors shadow-lg shadow-crimson/20"
          style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1rem', letterSpacing: '0.02em' }}
        >
          {t('startButton')} →
        </button>

      </main>
    </div>
  );
}
