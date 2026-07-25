'use client';
import { useTranslations } from 'next-intl';
import { RecapStats } from '@/lib/gameLogic';

interface RecapStatsProps {
  stats: RecapStats;
}

export default function RecapStatsPanel({ stats }: RecapStatsProps) {
  const t = useTranslations('recap');

  const rows = [
    { label: t('noWrong'), value: stats.noWrong, pts: 3, dotClass: 'bg-correct' },
    { label: t('oneWrong'), value: stats.oneWrong, pts: 2, dotClass: 'bg-ink' },
    { label: t('twoWrong'), value: stats.twoWrong, pts: 1, dotClass: 'bg-faint' },
    { label: t('autoPlaced'), value: stats.autoPlaced, pts: 0, dotClass: 'bg-primary' },
  ];

  const weakRegions = Object.entries(stats.byRegion)
    .filter(([, v]) => v.autoPlaced > 0)
    .sort((a, b) => b[1].autoPlaced - a[1].autoPlaced)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Score */}
      <div className="bg-white border border-border rounded-2xl p-6">
        <div className="flex items-end justify-between mb-6">
          <p
            className="text-muted font-medium uppercase"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', letterSpacing: '0.16em' }}
          >
            {t('score')}
          </p>
          <div className="flex items-baseline gap-1.5">
            <span
              data-testid="recap-score"
              className="font-extrabold text-ink leading-none"
              style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', lineHeight: '1' }}
            >
              {stats.score}
            </span>
            <span className="text-faint" style={{ fontFamily: 'var(--font-sans)', fontSize: '1.1rem' }}>
              /{stats.maxScore}
            </span>
          </div>
        </div>
        <div className="space-y-2.5 border-t border-border pt-5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.dotClass}`} />
              <span className="text-sm text-muted flex-1" style={{ fontFamily: 'var(--font-sans)' }}>{row.label}</span>
              <span className="text-sm font-semibold text-ink" style={{ fontFamily: 'var(--font-sans)' }}>{row.value}</span>
              <span className="text-faint w-12 text-right" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem' }}>{row.pts} pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weak regions */}
      {weakRegions.length > 0 && (
        <div className="bg-white border border-border rounded-2xl p-6">
          <h2
            className="text-muted font-medium uppercase mb-4"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', letterSpacing: '0.16em' }}
          >
            {t('byRegion')}
          </h2>
          <ul className="space-y-2">
            {weakRegions.map(([region, v]) => (
              <li key={region} className="flex items-center justify-between">
                <span className="text-sm text-ink" style={{ fontFamily: 'var(--font-sans)' }}>{region}</span>
                <span className="text-primary font-semibold" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem' }}>{v.autoPlaced} auto-placed</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
