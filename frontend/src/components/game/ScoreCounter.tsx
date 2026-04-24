'use client';
import { useTranslations } from 'next-intl';

interface ScoreCounterProps {
  score: number;
  total: number;
}

export default function ScoreCounter({ score, total }: ScoreCounterProps) {
  const t = useTranslations('game');
  return (
    <div data-testid="score-counter" className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-4 py-2 shadow-sm">
      <span className="text-sm font-medium text-gray-600">{t('score')}</span>
      <span className="text-lg font-bold text-red-900">
        {score} <span className="text-sm font-normal text-gray-400">/ {total * 3}</span>
      </span>
    </div>
  );
}
