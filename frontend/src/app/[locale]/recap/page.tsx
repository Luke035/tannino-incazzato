'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { CardAttempt, Filter } from '@/types';
import { computeRecapStats } from '@/lib/gameLogic';
import { fetchSaveSession } from '@/lib/api';
import RecapStatsPanel from '@/components/recap/RecapStats';
import AIReview from '@/components/recap/AIReview';
import Header from '@/components/Header';

export default function RecapPage() {
  const t = useTranslations('recap');
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedRef = useRef(false);

  const history = useMemo<CardAttempt[]>(() => {
    try {
      return JSON.parse(searchParams.get('history') ?? '[]');
    } catch {
      return [];
    }
  }, [searchParams]);

  const stats = useMemo(() => computeRecapStats(history), [history]);

  useEffect(() => {
    if (savedRef.current || history.length === 0) return;
    savedRef.current = true;

    const startedAt = sessionStorage.getItem('game_started_at');
    const filter = (searchParams.get('filter') ?? 'both') as Filter;
    const startedAtIso = startedAt
      ? new Date(parseInt(startedAt, 10)).toISOString()
      : new Date().toISOString();

    fetchSaveSession({ gameId: 'mappa-vini', filter, startedAt: startedAtIso, history })
      .then(() => sessionStorage.removeItem('game_started_at'))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (history.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <div className="flex-1 flex items-center justify-center flex-col gap-5">
          <p className="text-muted" style={{ fontFamily: 'var(--font-dm-sans)' }}>No session data found.</p>
          <button
            onClick={() => router.push('/')}
            className="px-8 py-3 bg-crimson text-white font-bold rounded-lg hover:bg-crimson-dark transition-colors"
            style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.95rem' }}
          >
            {t('newSession')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />
      <main data-testid="recap-screen" className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 flex flex-col gap-5">

        <div className="mb-2">
          <p
            className="text-muted font-medium uppercase mb-3"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.18em' }}
          >
            Sessione completata
          </p>
          <h1
            className="font-extrabold text-charcoal leading-none tracking-tight"
            style={{ fontFamily: 'var(--font-bricolage)', fontSize: 'clamp(2.5rem, 6vw, 3.5rem)', lineHeight: '0.95' }}
          >
            {t('title')}
          </h1>
        </div>

        <RecapStatsPanel stats={stats} />

        {history.length > 0 && <AIReview history={history} />}

        <button
          onClick={() => router.push('/')}
          className="w-full py-4 bg-crimson text-white font-bold rounded-xl hover:bg-crimson-dark transition-colors shadow-lg shadow-crimson/20"
          style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1rem', letterSpacing: '0.01em' }}
        >
          {t('newSession')} →
        </button>
      </main>
    </div>
  );
}
