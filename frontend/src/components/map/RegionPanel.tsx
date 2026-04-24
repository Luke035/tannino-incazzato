'use client';
import { CardAttempt } from '@/types';

interface RegionPanelProps {
  regionName: string;
  cards: CardAttempt[];
  onClose: () => void;
}

export default function RegionPanel({ regionName, cards, onClose }: RegionPanelProps) {
  return (
    <div className="absolute top-4 right-4 bg-white border border-amber-200 rounded-xl shadow-lg p-4 w-64 z-10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-red-900">{regionName}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No denominations placed yet</p>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {cards.map((card, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${card.result === 'auto-placed' ? 'bg-red-500' : 'bg-green-500'}`} />
              <span className="text-gray-800">{card.denomination.name}</span>
              <span className="text-gray-400 text-xs">{card.denomination.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
