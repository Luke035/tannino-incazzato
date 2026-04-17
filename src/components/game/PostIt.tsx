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

  const remainingRegions = denomination.regions.filter((r) => !foundRegions.includes(r));
  const isMultiRegion = denomination.regions.length > 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Post-it card */}
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className="bg-yellow-100 border border-yellow-300 rounded-lg shadow-lg p-5 select-none"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-xl font-bold text-gray-900 leading-tight">{denomination.name}</h2>
          <span
            className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${
              denomination.type === 'DOCG'
                ? 'bg-red-800 text-white'
                : 'bg-amber-700 text-white'
            }`}
          >
            {denomination.type}
          </span>
        </div>

        {isMultiRegion && (
          <div className="mt-2 space-y-1">
            {denomination.regions.map((region) => (
              <div key={region} className="flex items-center gap-2 text-sm">
                <span
                  className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    foundRegions.includes(region) ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
                <span className={foundRegions.includes(region) ? 'line-through text-gray-400' : 'text-gray-700'}>
                  {region}
                </span>
              </div>
            ))}
            <p className="text-xs text-gray-500 mt-1">
              {foundRegions.length}/{denomination.regions.length} {t('regionsFound')}
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3 italic">{t('dragInstruction')}</p>
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
        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-amber-700 mb-1">{t('hint')}</p>
          {isLoadingHint ? (
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <p className="text-sm text-gray-700">{hint}</p>
          )}
        </div>
      )}
    </div>
  );
}
