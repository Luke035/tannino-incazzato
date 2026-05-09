'use client';
import { useState } from 'react';
import Header from '@/components/Header';
import { Link } from '@/i18n/navigation';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface GameDef {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  available: boolean;
}

interface GameData {
  stats: {
    sessions: number;
    avgScore: number;
    bestScore: number;
    bestScoreSub: string;
    denomAttempted: number;
    denomTotal: number;
  };
  sessions: { id: number; date: string; filter: string; score: number; items: number; duration: string }[];
  typePerf: { label: string; score: number; color: string }[];
  topRegions: { name: string; score: number }[];
  lowRegions: { name: string; score: number }[];
}

/* ─── Mock data ──────────────────────────────────────────────────────── */

const USER = {
  name: 'Luca Grazioli',
  initials: 'LG',
  email: 'luca.grazioli91@gmail.com',
  since: 2024,
  level: 'Sommelier',
  levelProgress: 0.42,
  nextLevel: 'Sommelier Senior',
};

const GAMES: GameDef[] = [
  {
    id: 'mappa-vini',
    name: 'Mappa dei Vini',
    icon: '🗺️',
    tagline: 'Denominazioni DOC/DOCG · Regioni italiane',
    available: true,
  },
  {
    id: 'future-1',
    name: 'Prossimamente',
    icon: '✦',
    tagline: 'Nuovo gioco in arrivo',
    available: false,
  },
  {
    id: 'future-2',
    name: 'Prossimamente',
    icon: '✦',
    tagline: 'Nuovo gioco in arrivo',
    available: false,
  },
];

const GAME_DATA: Record<string, GameData> = {
  'mappa-vini': {
    stats: {
      sessions: 24,
      avgScore: 73,
      bestScore: 94,
      bestScoreSub: '25 Apr 2026 · DOCG',
      denomAttempted: 287,
      denomTotal: 410,
    },
    sessions: [
      { id: 1, date: '03 Mag 2026', filter: 'DOCG',  score: 87, items: 18, duration: '12 min' },
      { id: 2, date: '01 Mag 2026', filter: 'Tutti', score: 74, items: 41, duration: '28 min' },
      { id: 3, date: '28 Apr 2026', filter: 'DOC',   score: 68, items: 35, duration: '22 min' },
      { id: 4, date: '25 Apr 2026', filter: 'DOCG',  score: 91, items: 18, duration: '11 min' },
      { id: 5, date: '22 Apr 2026', filter: 'Tutti', score: 80, items: 41, duration: '25 min' },
    ],
    typePerf: [
      { label: 'DOCG',  score: 82, color: 'var(--crimson)' },
      { label: 'DOC',   score: 66, color: 'var(--navy)'    },
      { label: 'Tutti', score: 73, color: 'var(--charcoal)'},
    ],
    topRegions: [
      { name: 'Piemonte',  score: 91 },
      { name: 'Toscana',   score: 85 },
      { name: 'Veneto',    score: 79 },
      { name: 'Lombardia', score: 77 },
    ],
    lowRegions: [
      { name: 'Sardegna',     score: 48 },
      { name: 'Basilicata',   score: 54 },
      { name: 'Molise',       score: 58 },
      { name: "Valle d'Aosta", score: 61 },
    ],
  },
};

/* ─── Sub-components ─────────────────────────────────────────────────── */

function ScorePill({ score }: { score: number }) {
  const color = score >= 85 ? 'var(--jade)' : score >= 70 ? 'var(--navy)' : 'var(--crimson)';
  const bg    = score >= 85 ? 'var(--jade-light)' : score >= 70 ? '#EEF2FF' : 'var(--crimson-light)';
  return (
    <span
      className="font-bold rounded px-2 py-0.5"
      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color, background: bg }}
    >
      {score}%
    </span>
  );
}

function FilterBadge({ filter }: { filter: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    DOCG:  { color: 'var(--crimson)',  bg: 'var(--crimson-light)' },
    DOC:   { color: 'var(--navy)',     bg: '#EEF2FF'              },
    Tutti: { color: 'var(--charcoal)', bg: 'var(--surface)'      },
  };
  const s = map[filter] ?? map.Tutti;
  return (
    <span
      className="font-semibold rounded px-2 py-0.5 uppercase"
      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.1em', color: s.color, background: s.bg }}
    >
      {filter}
    </span>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */

export default function ProfilePage() {
  const [selectedGame, setSelectedGame] = useState<string>('mappa-vini');
  const data = GAME_DATA[selectedGame];

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 flex flex-col gap-8">

        {/* ── Profile hero ─────────────────────────────── */}
        <div
          className="animate-fade-up flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white rounded-2xl p-8 border border-border"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center gap-5">
            <div
              className="flex items-center justify-center rounded-2xl font-extrabold text-white flex-shrink-0"
              style={{
                width: 64, height: 64,
                background: 'linear-gradient(135deg, var(--crimson) 0%, var(--crimson-dark) 100%)',
                fontFamily: 'var(--font-bricolage)', fontSize: '1.4rem',
                boxShadow: '0 4px 16px rgba(193,0,31,0.3)',
              }}
            >
              {USER.initials}
            </div>
            <div>
              <h1
                className="font-extrabold text-charcoal"
                style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.6rem', lineHeight: 1.05 }}
              >
                {USER.name}
              </h1>
              <p className="text-muted mt-0.5" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}>
                {USER.email}
              </p>
              <div className="flex items-center gap-3 mt-3">
                <span
                  className="font-semibold text-crimson uppercase"
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', letterSpacing: '0.16em' }}
                >
                  {USER.level}
                </span>
                <div className="relative h-1.5 w-28 rounded-full bg-border overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-crimson transition-all"
                    style={{ width: `${USER.levelProgress * 100}%` }}
                  />
                </div>
                <span className="text-subtle" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem' }}>
                  → {USER.nextLevel}
                </span>
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="px-6 py-3 bg-crimson text-white font-bold rounded-lg hover:bg-crimson-dark transition-colors shadow-lg shadow-crimson/20 text-center flex-shrink-0"
            style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.9rem', letterSpacing: '0.02em' }}
          >
            Nuova sessione →
          </Link>
        </div>

        {/* ── Game selector ────────────────────────────── */}
        <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <p
            className="uppercase mb-3"
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.2em', color: 'var(--muted)' }}
          >
            Statistiche per gioco
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {GAMES.map((g) => {
              const isSelected = selectedGame === g.id;
              const sessions = g.available ? (GAME_DATA[g.id]?.stats.sessions ?? 0) : null;
              return (
                <button
                  key={g.id}
                  onClick={() => g.available && setSelectedGame(g.id)}
                  disabled={!g.available}
                  className="flex-shrink-0 flex items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-all"
                  style={{
                    minWidth: 200,
                    background: isSelected ? 'white' : 'white',
                    border: isSelected
                      ? '1.5px solid var(--crimson)'
                      : '1.5px solid var(--border)',
                    boxShadow: isSelected ? '0 4px 16px rgba(193,0,31,0.1)' : 'none',
                    opacity: g.available ? 1 : 0.45,
                    cursor: g.available ? 'pointer' : 'default',
                  }}
                >
                  <span className="text-xl mt-0.5 flex-shrink-0">
                    {g.icon}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="font-bold truncate"
                      style={{
                        fontFamily: 'var(--font-bricolage)',
                        fontSize: '0.9rem',
                        color: isSelected ? 'var(--crimson)' : 'var(--charcoal)',
                      }}
                    >
                      {g.name}
                    </p>
                    <p
                      className="truncate mt-0.5"
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: 'var(--subtle)' }}
                    >
                      {g.tagline}
                    </p>
                    {sessions !== null && (
                      <p
                        className="mt-1.5 font-semibold"
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: 'var(--muted)' }}
                      >
                        {sessions} sessioni
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="ml-auto flex-shrink-0 mt-0.5">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--crimson-light)' }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4.5L3 6L6.5 2.5" stroke="var(--crimson)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Stats row ────────────────────────────────── */}
        {data && (
          <>
            <div
              className="animate-fade-up grid grid-cols-2 lg:grid-cols-4 gap-4"
              style={{ animationDelay: '120ms' }}
            >
              {[
                { label: 'Sessioni',          value: data.stats.sessions.toString(), sub: `dal ${USER.since}`,               accent: 'var(--charcoal)' },
                { label: 'Punteggio medio',    value: `${data.stats.avgScore}%`,      sub: 'su tutte le sessioni',             accent: 'var(--navy)'     },
                { label: 'Miglior sessione',   value: `${data.stats.bestScore}%`,     sub: data.stats.bestScoreSub,            accent: 'var(--jade)'     },
                { label: 'Elementi tentati',   value: `${data.stats.denomAttempted}`, sub: `di ${data.stats.denomTotal} totali`, accent: 'var(--crimson)'  },
              ].map(({ label, value, sub, accent }) => (
                <div key={label} className="profile-stat-card">
                  <p
                    className="uppercase mb-3"
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--muted)' }}
                  >
                    {label}
                  </p>
                  <p
                    className="font-extrabold leading-none mb-1.5"
                    style={{ fontFamily: 'var(--font-bricolage)', fontSize: '2.2rem', color: accent, lineHeight: 1 }}
                  >
                    {value}
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: 'var(--subtle)' }}>
                    {sub}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Two-column content ───────────────────── */}
            <div
              className="animate-fade-up grid lg:grid-cols-[3fr_2fr] gap-6"
              style={{ animationDelay: '180ms' }}
            >
              {/* Recent sessions */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2
                    className="font-extrabold text-charcoal"
                    style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1.1rem' }}
                  >
                    Sessioni recenti
                  </h2>
                  <span
                    className="text-crimson font-semibold hover:underline cursor-pointer"
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem' }}
                  >
                    Vedi tutte
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {data.sessions.map((s) => (
                    <div key={s.id} className="session-row">
                      <div className="flex items-center gap-3">
                        <FilterBadge filter={s.filter} />
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: 'var(--muted)' }}>
                          {s.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span
                          className="hidden sm:block"
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: 'var(--subtle)' }}
                        >
                          {s.items} elementi · {s.duration}
                        </span>
                        <ScorePill score={s.score} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-5">
                {/* Type performance */}
                <div className="bg-white rounded-xl border border-border p-5">
                  <h3
                    className="font-extrabold text-charcoal mb-4"
                    style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1rem' }}
                  >
                    Per tipo
                  </h3>
                  <div className="flex flex-col gap-3.5">
                    {data.typePerf.map(({ label, score, color }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span
                            className="font-semibold uppercase"
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--charcoal)' }}
                          >
                            {label}
                          </span>
                          <span className="font-bold" style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.9rem', color }}>
                            {score}%
                          </span>
                        </div>
                        <div className="relative h-1.5 rounded-full bg-border overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, background: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Region performance */}
                <div className="bg-white rounded-xl border border-border p-5">
                  <h3
                    className="font-extrabold text-charcoal mb-4"
                    style={{ fontFamily: 'var(--font-bricolage)', fontSize: '1rem' }}
                  >
                    Regioni
                  </h3>
                  <div className="flex flex-col gap-2.5">
                    <p className="uppercase" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.57rem', letterSpacing: '0.16em', color: 'var(--jade)' }}>
                      Migliori
                    </p>
                    {data.topRegions.map(({ name, score }) => (
                      <div key={name} className="flex items-center justify-between">
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: 'var(--charcoal)' }}>{name}</span>
                        <span className="font-bold" style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.85rem', color: 'var(--jade)' }}>{score}%</span>
                      </div>
                    ))}
                    <div className="h-px bg-border my-0.5" />
                    <p className="uppercase" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.57rem', letterSpacing: '0.16em', color: 'var(--crimson)' }}>
                      Da migliorare
                    </p>
                    {data.lowRegions.map(({ name, score }) => (
                      <div key={name} className="flex items-center justify-between">
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: 'var(--charcoal)' }}>{name}</span>
                        <span className="font-bold" style={{ fontFamily: 'var(--font-bricolage)', fontSize: '0.85rem', color: 'var(--crimson)' }}>{score}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="h-4" />
      </main>
    </div>
  );
}
