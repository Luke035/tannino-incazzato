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
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-red-900 mb-3">{t('title')}</h1>
          <p className="text-gray-600 max-w-md text-lg">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-medium text-gray-700 uppercase tracking-wide">
            {t('filterLabel')}
          </span>
          <div className="flex gap-2">
            {(['both', 'DOCG', 'DOC'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-5 py-2 rounded-full border text-sm font-semibold transition-colors ${
                  filter === f
                    ? 'bg-red-800 text-white border-red-800'
                    : 'border-red-300 text-red-800 hover:bg-red-50'
                }`}
              >
                {f === 'both' ? t('filterBoth') : f === 'DOCG' ? t('filterDocg') : t('filterDoc')}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={start}
          className="px-10 py-3 bg-red-800 text-white rounded-full font-bold text-lg hover:bg-red-900 transition-colors shadow-md"
        >
          {t('startButton')}
        </button>
      </main>
    </div>
  );
}
