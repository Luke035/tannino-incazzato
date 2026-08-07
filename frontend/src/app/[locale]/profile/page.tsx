'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Header from '@/components/Header';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { fetchQuizStats, fetchSessionStats, QuizStats, SessionStats } from '@/lib/api';
import { svgIdToDisplay } from '@/lib/regionMapping';

/* ─── Game definitions ───────────────────────────────────────────────────── */

const GAMES = [
  {
    id: 'mappa-vini',
    icon: '🗺️',
    nameKey: 'Mappa dei Vini',
    tagline: 'Denominazioni DOC/DOCG · Regioni italiane',
    available: true,
  },
  {
    id: 'quiz',
    icon: '🍷',
    nameKey: 'Promossi o Cirrotici',
    tagline: 'Il banco domande · Esame, Practice, Ripasso',
    available: true,
  },
  { id: 'future-1', icon: '✦', available: false },
];

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function ScorePill({ score }: { score: number }) {
  const color = score >= 85 ? 'var(--correct)' : score >= 70 ? 'var(--rust)' : 'var(--primary)';
  const bg = score >= 85 ? '#E4F0E6' : score >= 70 ? '#EEF2FF' : '#F4E6E9';
  return (
    <span
      className="font-bold rounded px-2 py-0.5"
      style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color, background: bg }}
    >
      {Math.round(score)}%
    </span>
  );
}

function FilterBadge({ filter }: { filter: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    DOCG:  { color: 'var(--primary)',  bg: '#F4E6E9' },
    DOC:   { color: 'var(--rust)',     bg: '#EEF2FF'              },
    both:  { color: 'var(--ink)', bg: 'var(--surface)'      },
  };
  const s = map[filter] ?? map.both;
  const label = filter === 'both' ? 'Tutti' : filter;
  return (
    <span
      className="font-semibold rounded px-2 py-0.5 uppercase"
      style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', letterSpacing: '0.1em', color: s.color, background: s.bg }}
    >
      {label}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── Quiz panel (Promossi o Cirrotici) ──────────────────────────────────── */

function ScoreBar({ label, pct, answered, color }: { label: string; pct: number; answered: number; color: string }) {
  return (
    <div data-testid="quiz-breakdown-row">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--ink)' }}>
          {label}
          <span style={{ color: 'var(--faint)', fontWeight: 400 }}> · {answered}</span>
        </span>
        <span className="font-bold" style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-border overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function barColor(pct: number): string {
  return pct >= 70 ? 'var(--correct)' : pct >= 50 ? 'var(--rust)' : 'var(--primary)';
}

function QuizPanel({ stats }: { stats: QuizStats | null }) {
  const t = useTranslations('profile');
  const tq = useTranslations('quiz');
  if (!stats) return null;

  const isEmpty =
    stats.aggregate.total_exams === 0 &&
    stats.by_topic.length === 0 &&
    stats.pending_mastery === 0;

  if (isEmpty) {
    return (
      <div
        data-testid="quiz-empty-state"
        className="animate-fade-up flex flex-col items-center justify-center gap-4 py-16 bg-white rounded-2xl border border-border"
        style={{ animationDelay: '120ms' }}
      >
        <p className="font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
          {t('quizEmptyTitle')}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--muted)' }}>
          {t('quizEmptySubtitle')}
        </p>
        <Link
          href="/quiz"
          className="mt-2 px-6 py-3 bg-accent text-white font-bold rounded-full hover:opacity-90 transition-colors"
          style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}
        >
          {t('quizPlayCta')}
        </Link>
      </div>
    );
  }

  const agg = stats.aggregate;
  // The exam-centric cards read "0/0" and "0%" for a player who has only ever
  // practised — the "page of zeroes" the empty state exists to avoid. They earn
  // their place only once an Exam has actually been sat; the mastery card, which
  // counts every mode, is always honest and always shown.
  const hasExams = agg.total_exams > 0;
  const cards = [
    ...(hasExams
      ? [
          { label: t('quizExamsPassed'), value: `${agg.exams_passed}/${agg.total_exams}`, sub: t('quizExamsSat'), accent: 'var(--correct)' },
          { label: t('avgScore'), value: `${Math.round(agg.avg_score_pct)}%`, sub: t('quizAcrossExams'), accent: 'var(--rust)' },
          { label: t('bestSession'), value: `${Math.round(agg.best_score_pct)}%`, sub: t('quizBestExam'), accent: 'var(--ink)' },
        ]
      : []),
    { label: t('quizToMaster'), value: stats.pending_mastery.toString(), sub: t('quizStillWaiting'), accent: 'var(--primary)' },
  ];
  return (
    <div data-testid="quiz-stats" className="flex flex-col gap-8">
      {/* Aggregate cards */}
      <div className="animate-fade-up grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ animationDelay: '120ms' }}>
        {cards.map(({ label, value, sub, accent }) => (
          <div key={label} className="profile-stat-card">
            <p className="uppercase mb-3" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--muted)' }}>
              {label}
            </p>
            <p className="font-extrabold leading-none mb-1.5" style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: accent, lineHeight: 1 }}>
              {value}
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--faint)' }}>{sub}</p>
          </div>
        ))}
      </div>

      <div className="animate-fade-up grid lg:grid-cols-[3fr_2fr] gap-6" style={{ animationDelay: '180ms' }}>
        {/* Exam history */}
        <div className="flex flex-col gap-4">
          <h2 className="font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
            {t('quizExamHistory')}
          </h2>
          {stats.exams.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--muted)' }}>
              {t('quizNoExams')}
            </p>
          ) : (
            <div data-testid="quiz-exams" className="flex flex-col gap-2">
              {stats.exams.map((e) => (
                <div key={e.id} data-testid="quiz-exam-row" className="session-row">
                  <div className="flex items-center gap-3">
                    <span
                      className="font-semibold rounded px-2 py-0.5 uppercase"
                      style={{
                        fontFamily: 'var(--font-sans)', fontSize: '0.58rem', letterSpacing: '0.1em',
                        color: e.passed ? 'var(--correct)' : 'var(--primary)',
                        background: e.passed ? '#E4F0E6' : '#F4E6E9',
                      }}
                    >
                      {e.passed ? t('quizPassed') : t('quizFailed')}
                    </span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {formatDate(e.played_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {e.duration_seconds !== null && (
                      <span className="hidden sm:block" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--faint)' }}>
                        {formatDuration(e.duration_seconds)}
                      </span>
                    )}
                    <ScorePill score={e.score_pct} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Breakdowns */}
        <div className="flex flex-col gap-5">
          {stats.by_format.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5">
              <h3 className="font-extrabold text-ink mb-4" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                {t('quizByFormat')}
              </h3>
              <div className="flex flex-col gap-3.5">
                {stats.by_format.map((row) => (
                  <ScoreBar
                    key={row.format}
                    label={tq(`formatGroups.${row.format}`)}
                    pct={row.correct_pct}
                    answered={row.answered}
                    color={barColor(row.correct_pct)}
                  />
                ))}
              </div>
            </div>
          )}

          {stats.by_level.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5">
              <h3 className="font-extrabold text-ink mb-4" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                {t('quizByLevel')}
              </h3>
              <div className="flex flex-col gap-3.5">
                {stats.by_level.map((row) => (
                  <ScoreBar
                    key={row.level}
                    label={tq('level', { level: row.level })}
                    pct={row.correct_pct}
                    answered={row.answered}
                    color={barColor(row.correct_pct)}
                  />
                ))}
              </div>
            </div>
          )}

          {stats.by_topic.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-5">
              <h3 className="font-extrabold text-ink mb-4" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                {t('quizByTopic')}
              </h3>
              <div className="flex flex-col gap-3.5">
                {stats.by_topic.map((row) => (
                  <ScoreBar
                    key={row.topic}
                    label={tq(`topics.${row.topic}`)}
                    pct={row.correct_pct}
                    answered={row.answered}
                    color={barColor(row.correct_pct)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { user } = useAuth();
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [quizStats, setQuizStats] = useState<QuizStats | null>(null);
  const [selectedGame, setSelectedGame] = useState('mappa-vini');

  useEffect(() => {
    fetchSessionStats().then(setStats).catch(() => {});
    fetchQuizStats().then(setQuizStats).catch(() => {});
  }, []);

  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : '?';

  const sinceYear = user
    ? new Date((user as unknown as { created_at?: string }).created_at ?? Date.now()).getFullYear()
    : null;

  const isEmpty = stats?.aggregate.total_sessions === 0;

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
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary) 100%)',
                fontFamily: 'var(--font-display)', fontSize: '1.4rem',
                boxShadow: '0 4px 16px rgba(193,0,31,0.3)',
              }}
            >
              {initials}
            </div>
            <div>
              <h1
                className="font-extrabold text-ink"
                style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', lineHeight: 1.05 }}
              >
                {user ? `${user.first_name} ${user.last_name}` : ''}
              </h1>
              <p className="text-muted mt-0.5" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem' }}>
                {user?.email}
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="px-6 py-3 bg-accent text-white font-bold rounded-full hover:opacity-90 transition-colors shadow-lg text-center flex-shrink-0"
            style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', letterSpacing: '0.02em' }}
          >
            {t('newSession')}
          </Link>
        </div>

        {/* ── Game selector ────────────────────────────── */}
        <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <p
            className="uppercase mb-3"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', letterSpacing: '0.2em', color: 'var(--muted)' }}
          >
            {t('statsFor')}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {GAMES.map((g) => {
              const isSelected = selectedGame === g.id;
              const sessionCount = !g.available
                ? null
                : g.id === 'quiz'
                  ? (quizStats?.aggregate.total_exams ?? null)
                  : (stats?.aggregate.total_sessions ?? null);
              return (
                <button
                  key={g.id}
                  onClick={() => g.available && setSelectedGame(g.id)}
                  disabled={!g.available}
                  className="flex-shrink-0 flex items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-all"
                  style={{
                    minWidth: 200,
                    background: 'white',
                    border: isSelected ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                    boxShadow: isSelected ? '0 4px 16px rgba(193,0,31,0.1)' : 'none',
                    opacity: g.available ? 1 : 0.45,
                    cursor: g.available ? 'pointer' : 'default',
                  }}
                >
                  <span className="text-xl mt-0.5 flex-shrink-0">{g.icon}</span>
                  <div className="min-w-0">
                    <p
                      className="font-bold truncate"
                      style={{
                        fontFamily: 'var(--font-display)', fontSize: '0.9rem',
                        color: isSelected ? 'var(--primary)' : 'var(--ink)',
                      }}
                    >
                      {g.available ? g.nameKey : t('comingSoon')}
                    </p>
                    <p
                      className="truncate mt-0.5"
                      style={{ fontFamily: 'var(--font-sans)', fontSize: '0.7rem', color: 'var(--faint)' }}
                    >
                      {g.available ? g.tagline : t('comingSoonTagline')}
                    </p>
                    {sessionCount !== null && (
                      <p
                        className="mt-1.5 font-semibold"
                        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.68rem', color: 'var(--muted)' }}
                      >
                        {sessionCount} {t('sessions').toLowerCase()}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="ml-auto flex-shrink-0 mt-0.5">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#F4E6E9' }}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4.5L3 6L6.5 2.5" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Mappa dei Vini panel ─────────────────────── */}
        {selectedGame === 'mappa-vini' && (
          <>
        {/* ── Empty state ───────────────────────────────── */}
        {stats && isEmpty && (
          <div
            data-testid="profile-empty-state"
            className="animate-fade-up flex flex-col items-center justify-center gap-4 py-16 bg-white rounded-2xl border border-border"
            style={{ animationDelay: '120ms' }}
          >
            <p
              className="font-extrabold text-ink"
              style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}
            >
              {t('emptyTitle')}
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {t('emptySubtitle')}
            </p>
            <Link
              href="/"
              className="mt-2 px-6 py-3 bg-accent text-white font-bold rounded-full hover:opacity-90 transition-colors"
              style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}
            >
              {t('playCta')}
            </Link>
          </div>
        )}

        {/* ── Stats row ────────────────────────────────── */}
        {stats && !isEmpty && (
          <>
            <div
              data-testid="profile-stats"
              className="animate-fade-up grid grid-cols-2 lg:grid-cols-4 gap-4"
              style={{ animationDelay: '120ms' }}
            >
              {[
                {
                  label: t('sessions'),
                  value: stats.aggregate.total_sessions.toString(),
                  sub: sinceYear ? `${t('since')} ${sinceYear}` : '',
                  accent: 'var(--ink)',
                },
                {
                  label: t('avgScore'),
                  value: `${Math.round(stats.aggregate.avg_score_pct)}%`,
                  sub: t('allSessions'),
                  accent: 'var(--rust)',
                },
                {
                  label: t('bestSession'),
                  value: `${Math.round(stats.aggregate.best_score_pct)}%`,
                  sub: stats.aggregate.best_session
                    ? `${formatDate(stats.aggregate.best_session.played_at)} · ${stats.aggregate.best_session.filter === 'both' ? 'Tutti' : stats.aggregate.best_session.filter}`
                    : '',
                  accent: 'var(--correct)',
                },
                {
                  label: t('denominationsDiscovered'),
                  value: stats.aggregate.unique_denoms.toString(),
                  sub: `${t('of')} ${stats.aggregate.total_denoms} ${t('total')}`,
                  accent: 'var(--primary)',
                },
              ].map(({ label, value, sub, accent }) => (
                <div key={label} className="profile-stat-card">
                  <p className="uppercase mb-3" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--muted)' }}>
                    {label}
                  </p>
                  <p className="font-extrabold leading-none mb-1.5" style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: accent, lineHeight: 1 }}>
                    {value}
                  </p>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: 'var(--faint)' }}>
                    {sub}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Two-column content ───────────────────── */}
            <div className="animate-fade-up grid lg:grid-cols-[3fr_2fr] gap-6" style={{ animationDelay: '180ms' }}>

              {/* Recent sessions */}
              <div className="flex flex-col gap-4">
                <h2 className="font-extrabold text-ink" style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                  {t('recentSessions')}
                </h2>
                <div data-testid="profile-sessions" className="flex flex-col gap-2">
                  {stats.sessions.map((s) => (
                    <div key={s.id} data-testid="session-row" className="session-row">
                      <div className="flex items-center gap-3">
                        <FilterBadge filter={s.filter} />
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--muted)' }}>
                          {formatDate(s.played_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="hidden sm:block" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--faint)' }}>
                          {s.items} {t('items')} · {formatDuration(s.duration_seconds)}
                        </span>
                        <ScorePill score={s.score_pct} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-5">

                {/* Type performance */}
                {(stats.type_performance.doc_pct !== null || stats.type_performance.docg_pct !== null) && (
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="font-extrabold text-ink mb-4" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                      {t('byType')}
                    </h3>
                    <div className="flex flex-col gap-3.5">
                      {[
                        { label: 'DOCG', score: stats.type_performance.docg_pct, color: 'var(--primary)' },
                        { label: 'DOC',  score: stats.type_performance.doc_pct,  color: 'var(--rust)'    },
                      ]
                        .filter((row) => row.score !== null)
                        .map(({ label, score, color }) => (
                          <div key={label}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-semibold uppercase" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--ink)' }}>
                                {label}
                              </span>
                              <span className="font-bold" style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color }}>
                                {Math.round(score!)}%
                              </span>
                            </div>
                            <div className="relative h-1.5 rounded-full bg-border overflow-hidden">
                              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, background: color }} />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Region performance */}
                {(stats.top_regions.length > 0 || stats.low_regions.length > 0) && (
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="font-extrabold text-ink mb-4" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                      {t('regions')}
                    </h3>
                    <div className="flex flex-col gap-2.5">
                      {stats.top_regions.length > 0 && (
                        <>
                          <p className="uppercase" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.57rem', letterSpacing: '0.16em', color: 'var(--correct)' }}>
                            {t('best')}
                          </p>
                          {stats.top_regions.map(({ region, score_pct }) => (
                            <div key={region} className="flex items-center justify-between">
                              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--ink)' }}>
                                {svgIdToDisplay(region)}
                              </span>
                              <span className="font-bold" style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--correct)' }}>
                                {Math.round(score_pct)}%
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                      {stats.top_regions.length > 0 && stats.low_regions.length > 0 && (
                        <div className="h-px bg-border my-0.5" />
                      )}
                      {stats.low_regions.length > 0 && (
                        <>
                          <p className="uppercase" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.57rem', letterSpacing: '0.16em', color: 'var(--primary)' }}>
                            {t('toImprove')}
                          </p>
                          {stats.low_regions.map(({ region, score_pct }) => (
                            <div key={region} className="flex items-center justify-between">
                              <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: 'var(--ink)' }}>
                                {svgIdToDisplay(region)}
                              </span>
                              <span className="font-bold" style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--primary)' }}>
                                {Math.round(score_pct)}%
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
          </>
        )}

        {/* ── Promossi o Cirrotici panel ───────────────── */}
        {selectedGame === 'quiz' && <QuizPanel stats={quizStats} />}

        <div className="h-4" />
      </main>
    </div>
  );
}
