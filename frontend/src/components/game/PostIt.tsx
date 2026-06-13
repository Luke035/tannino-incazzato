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
    <div className="flex flex-col items-center gap-4">
      {/* Flashcard */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        data-testid="active-card"
        className="w-40 h-40 flex flex-col p-4 select-none rounded-2xl"
        style={{
          ...style,
          backgroundColor: 'var(--card)',
          rotate: '-2deg',
          boxShadow: '0 12px 28px rgba(36, 16, 22, 0.16)',
        }}
      >
        <div className="flex justify-start mb-2">
          <span
            className="text-white font-bold rounded-full px-2 py-1"
            style={{
              fontFamily: 'var(--font-nunito)',
              fontSize: '0.55rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              backgroundColor: isDocg ? 'var(--primary)' : 'var(--accent)',
            }}
          >
            {denomination.type}
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center px-1">
          <h2
            data-testid="card-name"
            className="font-bold text-center"
            style={{
              fontFamily: 'var(--font-baloo)',
              fontSize: '0.95rem',
              lineHeight: '1.2',
              color: 'var(--ink)',
            }}
          >
            {denomination.name}
          </h2>
        </div>

        {isMultiRegion && (
          <div className="flex justify-center gap-1.5 pt-1">
            {denomination.regions.map((region) => (
              <span
                key={region}
                className="w-2 h-2 rounded-full transition-colors"
                style={{
                  backgroundColor: foundRegions.includes(region) ? 'var(--correct)' : 'var(--border)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Wrong attempts */}
      <div className="flex items-center gap-2">
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-nunito)',
            fontSize: '0.6rem',
            letterSpacing: '0.14em',
            color: 'var(--muted)',
            fontWeight: '700',
          }}
        >
          {t('wrongAttempts')}
        </span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full transition-colors"
            style={{
              backgroundColor: i < wrongAttempts ? 'var(--rust)' : 'var(--border)',
            }}
          />
        ))}
      </div>

      {/* Hint */}
      {(hint || isLoadingHint) && (
        <div className="rounded-2xl p-4 w-full max-w-xs shadow-md" style={{ backgroundColor: '#FBF1EC', border: '1px solid #E7C3B3' }}>
          <p
            className="font-bold uppercase mb-2"
            style={{
              fontFamily: 'var(--font-nunito)',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              color: '#C2562B',
            }}
          >
            Il tannino brontola
          </p>
          {isLoadingHint ? (
            <div className="flex gap-1.5 items-center">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#C2562B', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#C2562B', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#C2562B', animationDelay: '300ms' }} />
            </div>
          ) : (
            <p
              data-testid="hint-text"
              className="text-sm leading-relaxed"
              style={{ fontFamily: 'var(--font-nunito)', color: '#6A4A3A' }}
            >
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
