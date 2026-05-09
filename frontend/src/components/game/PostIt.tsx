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
  const isDocg = denomination.type === 'DOCG';

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Flashcard */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        data-testid="active-card"
        className="bg-white border border-border rounded-xl w-40 h-40 flex flex-col p-4 select-none"
        style={{ ...style, boxShadow: '0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)' }}
      >
        <div className="flex justify-start mb-2">
          <span
            className={`text-white font-bold rounded px-1.5 py-0.5 ${isDocg ? 'bg-crimson' : 'bg-navy'}`}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            {denomination.type}
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center px-1">
          <h2
            data-testid="card-name"
            className="font-bold text-charcoal text-center leading-tight"
            style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.95rem', lineHeight: '1.2' }}
          >
            {denomination.name}
          </h2>
        </div>

        {isMultiRegion && (
          <div className="flex justify-center gap-1.5 pt-1">
            {denomination.regions.map((region) => (
              <span
                key={region}
                className={`w-2 h-2 rounded-full transition-colors ${foundRegions.includes(region) ? 'bg-jade' : 'bg-border'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Wrong attempts */}
      <div className="flex items-center gap-2">
        <span
          className="text-subtle uppercase"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em' }}
        >
          {t('wrongAttempts')}
        </span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${i < wrongAttempts ? 'bg-crimson' : 'bg-border'}`}
          />
        ))}
      </div>

      {/* Hint */}
      {(hint || isLoadingHint) && (
        <div className="bg-white border-2 border-border rounded-xl p-3 w-full max-w-xs shadow-sm">
          <p
            className="text-crimson font-semibold uppercase mb-1.5"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em' }}
          >
            {t('hint')}
          </p>
          {isLoadingHint ? (
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-crimson rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-crimson rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-crimson rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <p data-testid="hint-text" className="text-sm text-charcoal leading-relaxed" style={{ fontFamily: 'var(--font-dm-sans)' }}>
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
