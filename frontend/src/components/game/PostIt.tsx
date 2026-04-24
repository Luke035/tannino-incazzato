'use client';
import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Denomination } from '@/types';
import { useTranslations } from 'next-intl';

interface PostItProps {
  denomination: Denomination;
  foundRegions: string[];
  wrongAttempts: number;
  hint: string | null;
  isLoadingHint: boolean;
}

export default function PostIt({
  denomination,
  foundRegions,
  wrongAttempts,
  hint,
  isLoadingHint,
}: PostItProps) {
  const t = useTranslations('game');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'current-card',
  });

  const style: React.CSSProperties = {
    rotate: '-1deg',
    opacity: isDragging ? 0 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  const isMultiRegion = denomination.regions.length > 1;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Post-it card */}
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        data-testid="active-card"
        className="bg-yellow-100 border border-yellow-300 rounded-lg shadow-lg w-32 h-32 flex flex-col p-2 select-none"
      >
        <div className="flex justify-end">
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              denomination.type === 'DOCG' ? 'bg-red-800 text-white' : 'bg-amber-700 text-white'
            }`}
          >
            {denomination.type}
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center px-1">
          <h2 data-testid="card-name" className="text-sm font-bold text-gray-900 text-center leading-tight">{denomination.name}</h2>
        </div>

        {isMultiRegion && (
          <div className="flex justify-center gap-1 pb-1">
            {denomination.regions.map((region) => (
              <span
                key={region}
                className={`w-2 h-2 rounded-full ${foundRegions.includes(region) ? 'bg-green-500' : 'bg-gray-300'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Wrong attempt indicator */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 mr-1">{t('wrongAttempts')}:</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-3 h-3 rounded-full ${i < wrongAttempts ? 'bg-red-500' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      {/* Hint bubble */}
      {(hint || isLoadingHint) && (
        <div className="bg-white border border-amber-200 rounded-xl p-3 shadow-sm">
          <p className="text-xs font-semibold text-amber-700 mb-1">{t('hint')}</p>
          {isLoadingHint ? (
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <p data-testid="hint-text" className="text-sm text-gray-700">{hint}</p>
          )}
        </div>
      )}
    </div>
  );
}
