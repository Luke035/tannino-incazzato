'use client';
import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Denomination } from '@/types';
import { fetchMemorizeTip } from '@/lib/api';

interface AutoPlaceModalProps {
  denomination: Denomination;
  onContinue: () => void;
}

export default function AutoPlaceModal({ denomination, onContinue }: AutoPlaceModalProps) {
  const t = useTranslations('autoPlace');
  const locale = useLocale();
  const [tip, setTip] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMemorizeTip({
      denominationName: denomination.name,
      denominationType: denomination.type,
      correctRegions: denomination.regions,
      language: locale,
    })
      .then(setTip)
      .catch(() => setTip(''))
      .finally(() => setLoading(false));
  }, [denomination.name]);

  const isMulti = denomination.regions.length > 1;

  return (
    /* Backdrop */
    <div data-testid="auto-place-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">

        {/* Header */}
        <div className="bg-red-800 px-6 py-4">
          <p className="text-red-200 text-xs font-semibold uppercase tracking-wide mb-1">
            {t('title')}
          </p>
          <h2 className="text-white text-xl font-bold">{denomination.name}</h2>
          <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded bg-white/20 text-white">
            {denomination.type}
          </span>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-gray-500 text-sm">{t('subtitle')}</p>

          {/* Correct region(s) */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {isMulti ? t('correctRegions') : t('correctRegion')}
            </p>
            <div className="flex flex-wrap gap-2">
              {denomination.regions.map((region) => (
                <span
                  key={region}
                  className="px-3 py-1 bg-amber-100 border border-amber-300 rounded-full text-sm font-semibold text-amber-900"
                >
                  {region}
                </span>
              ))}
            </div>
          </div>

          {/* Memory tip */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              {t('memorizeTip')}
            </p>
            {loading ? (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="ml-1 text-sm text-gray-400">{t('loadingTip')}</span>
              </div>
            ) : (
              <p data-testid="memorize-tip" className="text-sm text-gray-700 leading-relaxed">{tip}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button
            onClick={onContinue}
            className="w-full py-3 bg-red-800 text-white rounded-full font-bold hover:bg-red-900 transition-colors"
          >
            {t('continue')}
          </button>
        </div>

      </div>
    </div>
  );
}
