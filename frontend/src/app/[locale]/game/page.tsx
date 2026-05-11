'use client';
import { useEffect, useReducer, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { svgCollisionDetection } from '@/lib/svgCollision';
import { useRouter } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Denomination, SessionState, CardAttempt, Filter } from '@/types';
import { shuffleArray, scoreForCard } from '@/lib/gameLogic';
import { svgIdToDisplay, regionToSvgId } from '@/lib/regionMapping';
import { fetchHint, fetchDenominations } from '@/lib/api';
import ItalyMap from '@/components/map/ItalyMap';
import PostIt from '@/components/game/PostIt';
import ScoreCounter from '@/components/game/ScoreCounter';
import AutoPlaceModal from '@/components/game/AutoPlaceModal';
import Header from '@/components/Header';

type GameAction =
  | { type: 'INIT'; payload: Denomination[] }
  | { type: 'CORRECT_DROP'; payload: { region: string } }
  | { type: 'WRONG_DROP'; payload: { region: string } }
  | { type: 'DISMISS_MODAL' }
  | { type: 'SET_HINT'; payload: string };

interface PendingAutoPlace {
  denomination: Denomination;
  attempt: CardAttempt;
  allRegions: string[];
  next: Denomination | undefined;
  rest: Denomination[];
}

interface GameState extends SessionState {
  hint: string | null;
  isLoadingHint: boolean;
  isComplete: boolean;
  pendingAutoPlace: PendingAutoPlace | null; // set when modal should be shown
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
    pendingAutoPlace: null,
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
        // Auto-place remaining — pause and show modal before advancing
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
          wrongAttempts: newWrong,
          hint: null,
          isLoadingHint: false,
          pendingAutoPlace: {
            denomination: state.current,
            attempt,
            allRegions,
            next,
            rest,
          },
        };
      }
      return { ...state, wrongAttempts: newWrong, isLoadingHint: true };
    }

    case 'DISMISS_MODAL': {
      if (!state.pendingAutoPlace) return state;
      const { attempt, allRegions, next, rest } = state.pendingAutoPlace;
      return {
        ...state,
        queue: rest,
        current: next ?? null,
        wrongAttempts: 0,
        foundRegions: [],
        history: [...state.history, attempt],
        placedCards: addToPlacedCards(state.placedCards, allRegions, attempt),
        hint: null,
        isLoadingHint: false,
        pendingAutoPlace: null,
        isComplete: !next && rest.length === 0,
      };
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
  const [dragging, setDragging] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Init session — fetch denominations from FastAPI
  useEffect(() => {
    fetchDenominations().then((all) => {
      const denominations = all.filter((d) => {
        if (filter === 'DOC') return d.type === 'DOC';
        if (filter === 'DOCG') return d.type === 'DOCG';
        return true;
      });
      sessionStorage.setItem('game_started_at', Date.now().toString());
      dispatch({ type: 'INIT', payload: shuffleArray(denominations) });
    });
  }, [filter]);

  // Fetch hint after wrong drop
  const fetchHintCallback = useCallback(
    async (wrongRegion: string) => {
      if (!state.current) return;
      const remainingRegions = state.current.regions.filter(
        (r) => !state.foundRegions.includes(r)
      );
      try {
        const hint = await fetchHint({
          denominationName: state.current.name,
          denominationType: state.current.type,
          wrongRegion,
          correctRegions: state.current.regions,
          remainingRegions,
          attemptNumber: state.wrongAttempts + 1,
          language: locale,
        });
        dispatch({ type: 'SET_HINT', payload: hint });
      } catch {
        dispatch({ type: 'SET_HINT', payload: '' });
      }
    },
    [state.current, state.foundRegions, state.wrongAttempts, locale]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragging(false);
      const { over } = event;
      if (!over || !state.current) return;

      const droppedSvgId = over.id as string;
      const droppedRegionDisplay = svgIdToDisplay(droppedSvgId);

      const remainingRegions = state.current.regions.filter(
        (r) => !state.foundRegions.includes(r)
      );

      if (state.pendingAutoPlace) return;

      if (remainingRegions.map(regionToSvgId).includes(droppedSvgId)) {
        dispatch({ type: 'CORRECT_DROP', payload: { region: remainingRegions.find(r => regionToSvgId(r) === droppedSvgId)! } });
      } else {
        dispatch({ type: 'WRONG_DROP', payload: { region: droppedRegionDisplay } });
        fetchHintCallback(droppedRegionDisplay);
      }
    },
    [state.current, state.foundRegions, fetchHintCallback]
  );

  const endSession = () => {
    const params = new URLSearchParams();
    params.set('history', JSON.stringify(state.history));
    params.set('filter', filter);
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
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted" style={{ fontFamily: 'var(--font-dm-sans)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {/* Auto-place modal — shown when 3 wrong attempts are reached */}
      {state.pendingAutoPlace && (
        <AutoPlaceModal
          denomination={state.pendingAutoPlace.denomination}
          onContinue={() => dispatch({ type: 'DISMISS_MODAL' })}
        />
      )}

      <DndContext sensors={sensors} collisionDetection={svgCollisionDetection} onDragStart={() => setDragging(true)} onDragEnd={handleDragEnd}>
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
          <div className="w-80 flex flex-col gap-4 p-6 border-l-2 border-border bg-surface overflow-hidden">
            <ScoreCounter score={state.score} total={state.history.length + (state.current ? 1 : 0)} />

            <div className="flex-1 overflow-y-auto">
              {state.current ? (
                <PostIt
                  denomination={state.current}
                  foundRegions={state.foundRegions}
                  wrongAttempts={state.wrongAttempts}
                  hint={state.hint}
                  isLoadingHint={state.isLoadingHint}
                />
              ) : (
                <div className="bg-surface border border-border rounded-xl p-5 text-center text-muted italic" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                  Session complete!
                </div>
              )}
            </div>

            <div>
              <p className="text-muted mb-2 text-center" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem' }}>
                {state.history.length} completed · {state.queue.length + (state.current ? 1 : 0)} remaining
              </p>
              <button
                onClick={endSession}
                className="w-full py-2.5 border-2 border-charcoal text-charcoal font-semibold rounded-lg hover:bg-charcoal hover:text-white transition-colors"
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}
              >
                {t('endSession')}
              </button>
            </div>
          </div>
        </main>

        <DragOverlay dropAnimation={null}>
          {dragging && state.current ? (
            <div
              className="bg-white border border-border rounded-xl w-40 h-40 flex flex-col p-4 select-none"
              style={{ rotate: '2deg', opacity: 0.93, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
            >
              <div className="flex justify-start mb-2">
                <span
                  className={`text-white font-bold rounded px-1.5 py-0.5 ${state.current.type === 'DOCG' ? 'bg-crimson' : 'bg-navy'}`}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                >
                  {state.current.type}
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center px-1">
                <h2
                  className="font-bold text-charcoal text-center"
                  style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.95rem', lineHeight: '1.2' }}
                >
                  {state.current.name}
                </h2>
              </div>
              {state.current.regions.length > 1 && (
                <div className="flex justify-center gap-1.5 pt-1">
                  {state.current.regions.map((region) => (
                    <span
                      key={region}
                      className={`w-2 h-2 rounded-full ${state.foundRegions.includes(region) ? 'bg-jade' : 'bg-border'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
