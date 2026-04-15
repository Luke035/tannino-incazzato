'use client';
import React from 'react';
import Italy from '@svg-maps/italy';

interface MapLocation {
  id: string;
  name: string;
  path: string;
}
import { useDroppable } from '@dnd-kit/core';
import { CardAttempt, Denomination } from '@/types';
import { regionToSvgId, svgIdToDisplay } from '@/lib/regionMapping';
import RegionPanel from './RegionPanel';
import { useState } from 'react';

interface ItalyMapProps {
  currentDenomination: Denomination | null;
  foundRegions: string[];
  placedCards: Record<string, CardAttempt[]>;
}

interface DroppableRegionProps {
  location: MapLocation;
  isCorrect: boolean;
  isFound: boolean;
  isActive: boolean;
  placedCount: number;
  centroid: { x: number; y: number } | null;
  onClick: () => void;
}

// Rough centroids for badge placement (viewBox 0 0 610 793)
const REGION_CENTROIDS: Record<string, { x: number; y: number }> = {
  'abruzzo': { x: 390, y: 370 },
  'aosta-valley': { x: 65, y: 105 },
  'apulia': { x: 460, y: 490 },
  'basilicata': { x: 400, y: 530 },
  'calabria': { x: 390, y: 620 },
  'campania': { x: 340, y: 490 },
  'emilia-romagna': { x: 250, y: 220 },
  'friuli-venezia-giulia': { x: 440, y: 135 },
  'lazio': { x: 300, y: 400 },
  'liguria': { x: 150, y: 230 },
  'lombardy': { x: 175, y: 130 },
  'marche': { x: 360, y: 310 },
  'molise': { x: 390, y: 440 },
  'piedmont': { x: 95, y: 165 },
  'sardinia': { x: 155, y: 570 },
  'sicily': { x: 310, y: 700 },
  'trentino-south-tyrol': { x: 275, y: 100 },
  'tuscany': { x: 240, y: 330 },
  'umbria': { x: 300, y: 355 },
  'veneto': { x: 330, y: 145 },
};

function DroppableRegion({ location, isCorrect, isFound, isActive, placedCount, centroid, onClick }: DroppableRegionProps) {
  const { isOver, setNodeRef } = useDroppable({ id: location.id });

  let fill = '#f5f0e8';
  if (isFound) fill = '#16a34a';
  else if (isOver && isActive) fill = '#fbbf24';
  else if (isCorrect && isActive) fill = '#fef3c7';
  else if (isOver) fill = '#e5d5b5';

  return (
    <g ref={setNodeRef as unknown as React.RefCallback<SVGGElement>} onClick={onClick} style={{ cursor: 'pointer' }}>
      <path
        d={location.path}
        fill={fill}
        stroke="#8b4513"
        strokeWidth="1"
        style={{ transition: 'fill 0.2s' }}
      />
      {placedCount > 0 && centroid && (
        <>
          <circle cx={centroid.x} cy={centroid.y} r="7" fill="#7c2d12" opacity="0.9" />
          <text
            x={centroid.x}
            y={centroid.y}
            fontSize="7"
            fill="white"
            textAnchor="middle"
            dominantBaseline="central"
            style={{ pointerEvents: 'none', fontWeight: 'bold' }}
          >
            {placedCount}
          </text>
        </>
      )}
    </g>
  );
}

export default function ItalyMap({ currentDenomination, foundRegions, placedCards }: ItalyMapProps) {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const correctSvgIds = currentDenomination
    ? currentDenomination.regions.map(regionToSvgId)
    : [];

  const foundSvgIds = foundRegions.map(regionToSvgId);

  return (
    <div className="relative w-full h-full flex flex-col items-center">
      <svg
        viewBox={Italy.viewBox}
        className="w-full max-w-lg"
        style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
      >
        {(Italy.locations as MapLocation[]).map((location) => {
          const displayName = svgIdToDisplay(location.id);
          const placed = placedCards[displayName] ?? [];

          return (
            <DroppableRegion
              key={location.id}
              location={location}
              isCorrect={correctSvgIds.includes(location.id)}
              isFound={foundSvgIds.includes(location.id)}
              isActive={!!currentDenomination}
              placedCount={placed.length}
              centroid={REGION_CENTROIDS[location.id] ?? null}
              onClick={() => setSelectedRegionId(location.id)}
            />
          );
        })}
      </svg>

      {selectedRegionId && (
        <RegionPanel
          regionName={svgIdToDisplay(selectedRegionId)}
          cards={placedCards[svgIdToDisplay(selectedRegionId)] ?? []}
          onClose={() => setSelectedRegionId(null)}
        />
      )}
    </div>
  );
}
