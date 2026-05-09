'use client';
import { useTranslations } from 'next-intl';

interface ScoreCounterProps {
  score: number;
  total: number;
}

export default function ScoreCounter({ score, total }: ScoreCounterProps) {
  const t = useTranslations('game');
  return (
    <div data-testid="score-counter" className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border-2 border-border shadow-sm">
      <span
        className="text-muted font-medium uppercase"
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em' }}
      >
        {t('score')}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className="font-extrabold text-charcoal leading-none"
          style={{ fontFamily: 'var(--font-bricolage)', fontSize: '2rem' }}
        >
          {score}
        </span>
        <span className="text-subtle text-sm" style={{ fontFamily: 'var(--font-dm-sans)' }}>
          /{total * 3}
        </span>
      </div>
    </div>
  );
}
