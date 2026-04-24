'use client';
import { useTranslations } from 'next-intl';
import { RecapStats } from '@/lib/gameLogic';

interface RecapStatsProps {
  stats: RecapStats;
}

export default function RecapStatsPanel({ stats }: RecapStatsProps) {
  const t = useTranslations('recap');

  const rows = [
    { label: t('noWrong'), value: stats.noWrong, pts: 3, color: 'bg-green-500' },
    { label: t('oneWrong'), value: stats.oneWrong, pts: 2, color: 'bg-yellow-400' },
    { label: t('twoWrong'), value: stats.twoWrong, pts: 1, color: 'bg-orange-400' },
    { label: t('autoPlaced'), value: stats.autoPlaced, pts: 0, color: 'bg-red-500' },
  ];

  const weakRegions = Object.entries(stats.byRegion)
    .filter(([, v]) => v.autoPlaced > 0)
    .sort((a, b) => b[1].autoPlaced - a[1].autoPlaced)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Score summary */}
      <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-bold text-red-900">{t('score')}</h2>
          <span data-testid="recap-score" className="text-3xl font-bold text-red-900">
            {stats.score}
            <span className="text-base font-normal text-gray-400"> / {stats.maxScore}</span>
          </span>
        </div>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${row.color}`} />
              <span className="text-sm text-gray-700 flex-1">{row.label}</span>
              <span className="text-sm font-semibold text-gray-900">{row.value}</span>
              <span className="text-xs text-gray-400 w-10 text-right">{row.pts} pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weak regions */}
      {weakRegions.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">{t('byRegion')}</h2>
          <ul className="space-y-1">
            {weakRegions.map(([region, v]) => (
              <li key={region} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{region}</span>
                <span className="text-red-500 text-xs">{v.autoPlaced} auto-placed</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
