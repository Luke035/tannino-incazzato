'use client';
import { CardAttempt } from '@/types';

interface RegionPanelProps {
  regionName: string;
  cards: CardAttempt[];
  onClose: () => void;
}

export default function RegionPanel({ regionName, cards, onClose }: RegionPanelProps) {
  return (
    <div className="absolute top-4 right-4 bg-white border border-border rounded-xl shadow-lg p-5 w-64 z-10">
      <div className="flex items-start justify-between mb-4">
        <h3
          className="font-bold text-ink leading-tight"
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}
        >
          {regionName}
        </h3>
        <button
          onClick={onClose}
          className="text-faint hover:text-ink transition-colors text-xl leading-none ml-3 mt-0.5"
        >
          ×
        </button>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-muted" style={{ fontFamily: 'var(--font-sans)' }}>
          No denominations placed yet
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
          {cards.map((card, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${card.result === 'auto-placed' ? 'bg-primary' : 'bg-correct'}`} />
              <span className="text-ink" style={{ fontFamily: 'var(--font-sans)' }}>{card.denomination.name}</span>
              <span className="text-faint text-xs ml-auto">{card.denomination.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
