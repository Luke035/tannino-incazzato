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
    <div data-testid="auto-place-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">

        {/* Header */}
        <div className="bg-charcoal px-7 py-6">
          <p
            className="text-subtle font-medium uppercase mb-3"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.18em' }}
          >
            {t('title')}
          </p>
          <h2
            className="text-white font-bold leading-tight"
            style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.6rem' }}
          >
            {denomination.name}
          </h2>
          <span
            className={`inline-block mt-3 text-white font-bold px-2 py-0.5 rounded text-xs ${denomination.type === 'DOCG' ? 'bg-crimson' : 'bg-navy'}`}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            {denomination.type}
          </span>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-5">
          <p className="text-muted text-sm" style={{ fontFamily: 'var(--font-dm-sans)' }}>
            {t('subtitle')}
          </p>

          <div>
            <p
              className="text-muted font-semibold uppercase mb-3"
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.16em' }}
            >
              {isMulti ? t('correctRegions') : t('correctRegion')}
            </p>
            <div className="flex flex-wrap gap-2">
              {denomination.regions.map((region) => (
                <span
                  key={region}
                  className="px-3 py-1.5 bg-jade-light text-jade text-sm font-semibold rounded-lg"
                  style={{ fontFamily: 'var(--font-dm-sans)' }}
                >
                  {region}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-xl p-4 border border-border">
            <p
              className="text-muted font-semibold uppercase mb-3"
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.16em' }}
            >
              {t('memorizeTip')}
            </p>
            {loading ? (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-crimson rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-crimson rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-crimson rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="ml-1 text-sm text-muted" style={{ fontFamily: 'var(--font-dm-sans)' }}>{t('loadingTip')}</span>
              </div>
            ) : (
              <p data-testid="memorize-tip" className="text-sm text-charcoal leading-relaxed" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                {tip}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 pb-7">
          <button
            onClick={onContinue}
            className="w-full py-3.5 bg-crimson text-white font-bold rounded-lg hover:bg-crimson-dark transition-colors"
            style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.95rem', letterSpacing: '0.02em' }}
          >
            {t('continue')} →
          </button>
        </div>

      </div>
    </div>
  );
}
