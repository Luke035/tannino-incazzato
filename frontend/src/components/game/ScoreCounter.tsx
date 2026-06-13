'use client';
import { useTranslations } from 'next-intl';

interface ScoreCounterProps {
  score: number;
  total: number;
}

export default function ScoreCounter({ score, total }: ScoreCounterProps) {
  const t = useTranslations('game');
  return (
    <div
      data-testid="score-counter"
      className="flex items-center justify-between rounded-2xl px-5 py-4 border border-border shadow-md"
      style={{ backgroundColor: 'var(--card)' }}
    >
      <span
        className="font-bold uppercase"
        style={{
          fontFamily: 'var(--font-nunito)',
          fontSize: '0.66rem',
          letterSpacing: '0.14em',
          color: 'var(--muted)',
        }}
      >
        {t('score')}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className="font-extrabold leading-none"
          style={{
            fontFamily: 'var(--font-baloo)',
            fontSize: '2rem',
            color: 'var(--primary)',
          }}
        >
          {score}
        </span>
        <span style={{ fontFamily: 'var(--font-nunito)', fontSize: '0.75rem', color: 'var(--muted)' }}>
          /{total * 3}
        </span>
      </div>
    </div>
  );
}
