'use client';
import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { CardAttempt } from '@/types';
import { fetchReview } from '@/lib/api';

interface AIReviewProps {
  history: CardAttempt[];
}

export default function AIReview({ history }: AIReviewProps) {
  const t = useTranslations('recap');
  const locale = useLocale();
  const [review, setReview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReview({ history, language: locale })
      .then(setReview)
      .catch(() => setReview('Could not load review.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white border border-border rounded-2xl p-6">
      <h2
        className="text-muted font-medium uppercase mb-4"
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', letterSpacing: '0.16em' }}
      >
        {t('aiReview')}
      </h2>
      {loading ? (
        <div className="flex gap-1.5 items-center py-1">
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="ml-2 text-sm text-muted" style={{ fontFamily: 'var(--font-sans)' }}>{t('loadingReview')}</span>
        </div>
      ) : (
        <p data-testid="ai-review-text" className="text-sm text-ink leading-relaxed" style={{ fontFamily: 'var(--font-sans)' }}>
          {review}
        </p>
      )}
    </div>
  );
}
