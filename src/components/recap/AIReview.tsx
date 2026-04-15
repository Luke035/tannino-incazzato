'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { CardAttempt } from '@/types';

interface AIReviewProps {
  history: CardAttempt[];
}

export default function AIReview({ history }: AIReviewProps) {
  const t = useTranslations('recap');
  const locale = useLocale();
  const [review, setReview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const payload = history.map((h) => ({
      name: h.denomination.name,
      type: h.denomination.type,
      correctRegions: h.denomination.regions,
      wrongAttempts: h.wrongAttempts,
      result: h.result,
    }));

    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: payload, language: locale }),
    })
      .then((r) => r.json())
      .then((d) => setReview(d.review))
      .catch(() => setReview('Could not load review.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
      <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">{t('aiReview')}</h2>
      {loading ? (
        <div className="flex gap-1 items-center py-2">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="ml-2 text-sm text-gray-400">{t('loadingReview')}</span>
        </div>
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed">{review}</p>
      )}
    </div>
  );
}
