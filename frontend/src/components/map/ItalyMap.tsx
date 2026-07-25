'use client';
import React, { useEffect, useRef, useState } from 'react';
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

interface ItalyMapProps {
  currentDenomination: Denomination | null;
  foundRegions: string[];
  placedCards: Record<string, CardAttempt[]>;
}

interface DroppableRegionProps {
  location: MapLocation;
  isFound: boolean;
  isActive: boolean;
  placedCount: number;
  centroid: { x: number; y: number } | null;
  onClick: () => void;
}


function DroppableRegion({ location, isFound, isActive, placedCount, centroid, onClick }: DroppableRegionProps) {
  const { isOver, setNodeRef } = useDroppable({ id: location.id });

  let fill = '#C8D6E5';
  if (isFound) fill = '#00875A';
  else if (isOver && isActive) fill = '#F87171';
  else if (isOver) fill = '#A8BFCF';

  return (
    <g ref={setNodeRef as unknown as React.RefCallback<SVGGElement>} onClick={onClick} style={{ cursor: 'pointer' }}>
      <path
        id={location.id}
        d={location.path}
        fill={fill}
        stroke="#7A9BB5"
        strokeWidth="0.8"
        style={{ transition: 'fill 0.2s' }}
      />
      {placedCount > 0 && centroid && (
        <>
          <circle cx={centroid.x} cy={centroid.y} r="14" fill="#111827" opacity="0.85" />
          <text
            x={centroid.x}
            y={centroid.y}
            fontSize="12"
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
  const [centroids, setCentroids] = useState<Record<string, { x: number; y: number }>>({});
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const computed: Record<string, { x: number; y: number }> = {};
    (Italy.locations as MapLocation[]).forEach((location) => {
      const pathEl = svgRef.current!.querySelector<SVGPathElement>(`#${location.id}`);
      if (pathEl) {
        const bbox = pathEl.getBBox();
        computed[location.id] = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
      }
    });
    setCentroids(computed);
  }, []);

  const foundSvgIds = foundRegions.map(regionToSvgId);

  const placedBySvgId = React.useMemo(() => {
    const acc: Record<string, CardAttempt[]> = {};
    for (const [regionName, attempts] of Object.entries(placedCards)) {
      const id = regionToSvgId(regionName);
      acc[id] = [...(acc[id] ?? []), ...attempts];
    }
    return acc;
  }, [placedCards]);

  return (
    <div className="relative w-full h-full flex flex-col items-center">
      <svg
        ref={svgRef}
        viewBox={Italy.viewBox}
        className="w-full max-w-lg"
        style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
      >
        {(Italy.locations as MapLocation[]).map((location) => {
          const placed = placedBySvgId[location.id] ?? [];

          return (
            <DroppableRegion
              key={location.id}
              location={location}
              isFound={foundSvgIds.includes(location.id)}
              isActive={!!currentDenomination}
              placedCount={placed.length}
              centroid={centroids[location.id] ?? null}
              onClick={() => setSelectedRegionId(location.id)}
            />
          );
        })}
      </svg>

      {selectedRegionId && (
        <RegionPanel
          regionName={svgIdToDisplay(selectedRegionId)}
          cards={placedBySvgId[selectedRegionId] ?? []}
          onClose={() => setSelectedRegionId(null)}
        />
      )}
    </div>
  );
}
