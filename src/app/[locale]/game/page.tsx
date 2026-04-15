'use client';
import { useEffect, useReducer, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useRouter } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Denomination, SessionState, CardAttempt, Filter } from '@/types';
import { shuffleArray, scoreForCard } from '@/lib/gameLogic';
import { svgIdToDisplay } from '@/lib/regionMapping';
import ItalyMap from '@/components/map/ItalyMap';
import PostIt from '@/components/game/PostIt';
import ScoreCounter from '@/components/game/ScoreCounter';
import Header from '@/components/Header';
import allDenominations from '@/data/denominations.json';

type GameAction =
  | { type: 'INIT'; payload: Denomination[] }
  | { type: 'CORRECT_DROP'; payload: { region: string } }
  | { type: 'WRONG_DROP'; payload: { region: string } }
  | { type: 'AUTO_PLACE' }
  | { type: 'SET_HINT'; payload: string };

interface GameState extends SessionState {
  hint: string | null;
  isLoadingHint: boolean;
  isComplete: boolean;
}

function getInitialState(): GameState {
  return {
    queue: [],
    current: null,
    wrongAttempts: 0,
    foundRegions: [],
    history: [],
    score: 0,
    placedCards: {},
    hint: null,
    isLoadingHint: false,
    isComplete: false,
  };
}

function addToPlacedCards(
  placedCards: Record<string, CardAttempt[]>,
  regions: string[],
  attempt: CardAttempt
): Record<string, CardAttempt[]> {
  const updated = { ...placedCards };
  for (const region of regions) {
    updated[region] = [...(updated[region] ?? []), attempt];
  }
  return updated;
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'INIT': {
      const [first, ...rest] = action.payload;
      return { ...getInitialState(), queue: rest, current: first ?? null };
    }

    case 'CORRECT_DROP': {
      if (!state.current) return state;
      const newFound = [...state.foundRegions, action.payload.region];
      const remaining = state.current.regions.filter((r) => !newFound.includes(r));

      if (remaining.length === 0) {
        // Card complete — all regions found
        const attempt: CardAttempt = {
          denomination: state.current,
          wrongAttempts: state.wrongAttempts,
          result: 'correct',
          foundRegions: newFound,
          autoPlacedRegions: [],
        };
        const [next, ...rest] = state.queue;
        return {
          ...state,
          queue: rest,
          current: next ?? null,
          wrongAttempts: 0,
          foundRegions: [],
          history: [...state.history, attempt],
          score: state.score + scoreForCard(state.wrongAttempts, 'correct'),
          placedCards: addToPlacedCards(state.placedCards, newFound, attempt),
          hint: null,
          isLoadingHint: false,
          isComplete: !next && rest.length === 0,
        };
      }

      // More regions still to find
      return { ...state, foundRegions: newFound, hint: null };
    }

    case 'WRONG_DROP': {
      if (!state.current) return state;
      const newWrong = state.wrongAttempts + 1;
      if (newWrong >= 3) {
        // Auto-place remaining
        const autoPlaced = state.current.regions.filter(
          (r) => !state.foundRegions.includes(r)
        );
        const attempt: CardAttempt = {
          denomination: state.current,
          wrongAttempts: newWrong,
          result: 'auto-placed',
          foundRegions: state.foundRegions,
          autoPlacedRegions: autoPlaced,
        };
        const allRegions = [...state.foundRegions, ...autoPlaced];
        const [next, ...rest] = state.queue;
        return {
          ...state,
          queue: rest,
          current: next ?? null,
          wrongAttempts: 0,
          foundRegions: [],
          history: [...state.history, attempt],
          placedCards: addToPlacedCards(state.placedCards, allRegions, attempt),
          hint: null,
          isLoadingHint: true,
          isComplete: !next && rest.length === 0,
        };
      }
      return { ...state, wrongAttempts: newWrong, isLoadingHint: true };
    }

    case 'SET_HINT':
      return { ...state, hint: action.payload, isLoadingHint: false };

    default:
      return state;
  }
}

export default function GamePage() {
  const t = useTranslations('game');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = (searchParams.get('filter') ?? 'both') as Filter;

  const [state, dispatch] = useReducer(gameReducer, getInitialState());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Init session
  useEffect(() => {
    const denominations = (allDenominations as Denomination[]).filter((d) => {
      if (filter === 'DOC') return d.type === 'DOC';
      if (filter === 'DOCG') return d.type === 'DOCG';
      return true;
    });
    dispatch({ type: 'INIT', payload: shuffleArray(denominations) });
  }, [filter]);

  // Fetch hint after wrong drop
  const fetchHint = useCallback(
    async (wrongRegion: string) => {
      if (!state.current) return;
      const remainingRegions = state.current.regions.filter(
        (r) => !state.foundRegions.includes(r)
      );
      try {
        const res = await fetch('/api/hint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            denominationName: state.current.name,
            denominationType: state.current.type,
            wrongRegion,
            correctRegions: state.current.regions,
            remainingRegions,
            attemptNumber: state.wrongAttempts + 1,
            language: locale,
          }),
        });
        const data = await res.json();
        dispatch({ type: 'SET_HINT', payload: data.hint });
      } catch {
        dispatch({ type: 'SET_HINT', payload: '' });
      }
    },
    [state.current, state.foundRegions, state.wrongAttempts, locale]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { over } = event;
      if (!over || !state.current) return;

      const droppedSvgId = over.id as string;
      const droppedRegionDisplay = svgIdToDisplay(droppedSvgId);

      const remainingRegions = state.current.regions.filter(
        (r) => !state.foundRegions.includes(r)
      );

      if (remainingRegions.includes(droppedRegionDisplay)) {
        dispatch({ type: 'CORRECT_DROP', payload: { region: droppedRegionDisplay } });
      } else {
        dispatch({ type: 'WRONG_DROP', payload: { region: droppedRegionDisplay } });
        fetchHint(droppedRegionDisplay);
      }
    },
    [state.current, state.foundRegions, fetchHint]
  );

  const endSession = () => {
    const params = new URLSearchParams();
    params.set('history', JSON.stringify(state.history));
    router.push(`/recap?${params.toString()}`);
  };

  // Auto-navigate when all cards are exhausted
  useEffect(() => {
    if (state.isComplete && state.history.length > 0) {
      endSession();
    }
  }, [state.isComplete]);

  if (!state.current && state.history.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <main className="flex-1 flex gap-0 overflow-hidden">
          {/* Left: Map */}
          <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
            <ItalyMap
              currentDenomination={state.current}
              foundRegions={state.foundRegions}
              placedCards={state.placedCards}
            />
          </div>

          {/* Right: Post-it + controls */}
          <div className="w-80 flex flex-col gap-4 p-6 border-l border-amber-200 bg-amber-50">
            <ScoreCounter score={state.score} total={state.history.length + (state.current ? 1 : 0)} />

            {state.current ? (
              <PostIt
                denomination={state.current}
                foundRegions={state.foundRegions}
                wrongAttempts={state.wrongAttempts}
                hint={state.hint}
                isLoadingHint={state.isLoadingHint}
              />
            ) : (
              <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-5 text-center text-gray-500 italic">
                Session complete!
              </div>
            )}

            <div className="mt-auto">
              <p className="text-xs text-gray-400 mb-2 text-center">
                {state.history.length} completed · {state.queue.length + (state.current ? 1 : 0)} remaining
              </p>
              <button
                onClick={endSession}
                className="w-full py-2 rounded-full border border-red-800 text-red-800 text-sm font-semibold hover:bg-red-50 transition-colors"
              >
                {t('endSession')}
              </button>
            </div>
          </div>
        </main>
      </DndContext>
    </div>
  );
}
