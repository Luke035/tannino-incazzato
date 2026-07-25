'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { Filter } from '@/types';

export default function WineMapSetupPage() {
  const t = useTranslations();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('both');

  const start = () => {
    // Store start time in sessionStorage
    sessionStorage.setItem('game_started_at', Date.now().toString());
    router.push(`/game?filter=${filter}`);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center gap-12 px-8 py-16">
        {/* Hero section with mascot */}
        <div className="text-center max-w-xl">
          <div className="mb-8 flex justify-center">
            <Mascot mood="skeptical" size={80} />
          </div>
          <p
            className="font-bold tracking-widest uppercase mb-4"
            style={{
              fontFamily: 'var(--font-nunito)',
              fontSize: '0.66rem',
              letterSpacing: '0.18em',
              color: 'var(--accent)',
            }}
          >
            {t('setup.subtitle')}
          </p>
          <h1
            className="leading-tight tracking-tight mb-4"
            style={{
              fontFamily: 'var(--font-baloo)',
              fontSize: 'clamp(2.4rem, 6vw, 4rem)',
              lineHeight: '0.95',
              color: 'var(--ink)',
            }}
          >
            {t('home.games.wineMap.title')}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-nunito)',
              fontSize: '0.92rem',
              color: 'var(--muted)',
            }}
          >
            {t('setup.description')}
          </p>
        </div>

        {/* Filter segmented control */}
        <div className="flex flex-col items-center gap-4">
          <p
            className="font-bold tracking-widest uppercase"
            style={{
              fontFamily: 'var(--font-nunito)',
              fontSize: '0.66rem',
              letterSpacing: '0.18em',
              color: 'var(--muted)',
            }}
          >
            {t('setup.filterLabel')}
          </p>
          <div
            className="flex gap-2 p-2 rounded-full"
            style={{
              backgroundColor: 'var(--soon)',
            }}
          >
            {(['both', 'DOCG', 'DOC'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-6 py-2.5 font-bold rounded-full transition-all ${
                  filter === f ? 'text-white shadow-md' : 'text-var(--ink)'
                }`}
                style={{
                  fontFamily: 'var(--font-nunito)',
                  fontSize: '0.92rem',
                  backgroundColor: filter === f ? 'var(--primary)' : 'transparent',
                  color: filter === f ? 'white' : 'var(--ink)',
                  fontWeight: '700',
                }}
              >
                {f === 'both'
                  ? t('setup.filterBoth')
                  : f === 'DOCG'
                    ? t('setup.filterDocg')
                    : t('setup.filterDoc')}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          data-testid="start-button"
          onClick={start}
          className="px-8 py-3 font-bold rounded-full text-white transition-opacity hover:opacity-90 shadow-lg"
          style={{
            fontFamily: 'var(--font-nunito)',
            fontSize: '0.92rem',
            backgroundColor: 'var(--accent)',
            boxShadow: '0 8px 22px rgba(36, 56, 255, 0.3)',
          }}
        >
          {t('setup.startButton')}
        </button>
      </main>
    </div>
  );
}
