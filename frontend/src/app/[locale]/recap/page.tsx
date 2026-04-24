'use client';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { CardAttempt } from '@/types';
import { computeRecapStats } from '@/lib/gameLogic';
import RecapStatsPanel from '@/components/recap/RecapStats';
import AIReview from '@/components/recap/AIReview';
import Header from '@/components/Header';

export default function RecapPage() {
  const t = useTranslations('recap');
  const router = useRouter();
  const searchParams = useSearchParams();

  const history = useMemo<CardAttempt[]>(() => {
    try {
      return JSON.parse(searchParams.get('history') ?? '[]');
    } catch {
      return [];
    }
  }, [searchParams]);

  const stats = useMemo(() => computeRecapStats(history), [history]);

  if (history.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-gray-500">No session data found.</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-red-800 text-white rounded-full font-semibold hover:bg-red-900"
          >
            {t('newSession')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-red-900 text-center">{t('title')}</h1>

        <RecapStatsPanel stats={stats} />

        {history.length > 0 && <AIReview history={history} />}

        <button
          onClick={() => router.push('/')}
          className="w-full py-3 bg-red-800 text-white rounded-full font-bold text-lg hover:bg-red-900 transition-colors shadow-md"
        >
          {t('newSession')}
        </button>
      </main>
    </div>
  );
}
