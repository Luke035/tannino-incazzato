'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { Choice } from '@/components/quiz/Choice';
import { fetchCurrentExam, fetchErrorReviewPool, ReviewRefusal, startErrorReview } from '@/lib/api';
import {
  DEFAULT_REVIEW_LENGTH,
  MASTERY_SESSIONS,
  ReviewLength,
  REVIEW_LENGTHS,
} from '@/lib/review';

/** One choice and a button — and, above both, the number that decides whether
 *  either is on offer at all.
 *
 *  There is no Level here, unlike Practice: the pool is this player's own
 *  record, and choosing which part of it to review would be the game picking
 *  the questions again. */
export default function ReviewSetupPage() {
  const t = useTranslations();
  const router = useRouter();

  const [length, setLength] = useState<ReviewLength>(DEFAULT_REVIEW_LENGTH);
  // How many questions are still waiting. `undefined` is "not asked yet",
  // `null` is "the backend did not answer" — and neither is ever rendered as
  // zero, which is the one lie this screen must not tell.
  const [pending, setPending] = useState<number | null | undefined>(undefined);
  const [masterySessions, setMasterySessions] = useState(MASTERY_SESSIONS);
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<ReviewRefusal | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // A Session already open holds the one slot across every mode, so there
      // is nothing to start here — the landing screen is where it is resumed or
      // binned, and that is where the student goes.
      const open = await fetchCurrentExam();
      if (cancelled) return;
      if (open) {
        router.replace('/quiz');
        return;
      }
      const pool = await fetchErrorReviewPool();
      if (cancelled) return;
      setPending(pool ? pool.pending : null);
      if (pool) setMasterySessions(pool.mastery_sessions);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const start = async () => {
    setStarting(true);
    setRefused(null);
    const result = await startErrorReview(length);

    if ('started' in result) {
      router.push(`/quiz/review/${result.started.id}`);
      return;
    }
    setStarting(false);
    if (result.refused === 'in_progress') {
      router.push('/quiz');
      return;
    }
    // The pool emptied between the count and the tap — another tab, most
    // likely. Show the empty state rather than an error: it is the same
    // situation, and it is good news.
    if (result.refused === 'nothing_to_review') {
      setPending(0);
      return;
    }
    setRefused(result.refused);
  };

  const empty = pending === 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main
        data-testid="review-setup"
        className="flex-1 flex flex-col gap-6 w-full max-w-2xl mx-auto px-5 py-8 sm:px-8 sm:py-12"
      >
        <Link
          href="/quiz"
          className="font-bold self-start"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          {t('quiz.review.result.backToQuiz')}
        </Link>

        <div>
          <p
            className="font-bold tracking-widest uppercase mb-2"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.66rem',
              letterSpacing: '0.18em',
              color: 'var(--accent)',
            }}
          >
            {t('quiz.review.eyebrow')}
          </p>
          <h1
            className="leading-tight tracking-tight mb-2"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.9rem, 7vw, 3rem)',
              lineHeight: '1',
              color: 'var(--ink)',
            }}
          >
            {t('quiz.review.title')}
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', color: 'var(--muted)' }}>
            {t('quiz.review.subtitle', { count: masterySessions })}
          </p>
        </div>

        {/* The count, before anything else on the screen. Every other control
            here is meaningless without it, and a student is owed the number
            before they commit five minutes to it. */}
        {pending !== undefined && pending !== null && !empty && (
          <p
            data-testid="review-pool"
            className="card-rounded px-5 py-4"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--ink)',
              backgroundColor: 'var(--surface-2)',
              border: '2px solid var(--border)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('quiz.review.pool', { count: pending })}
          </p>
        )}

        {/* An empty pool is a designed state, not an error and not a blank
            screen. It is also the only place in the product where a student can
            be told they have finished something, so it says so — and then sends
            them somewhere, because "well done, now what" is not an answer. */}
        {empty && (
          <section
            data-testid="review-empty"
            className="flex flex-col items-center gap-4 text-center card-rounded p-6 sm:p-8"
            style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--correct)' }}
          >
            <Mascot mood="happy" size={80} />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.4rem, 6vw, 1.9rem)',
                color: 'var(--ink)',
              }}
            >
              {t('quiz.review.emptyTitle')}
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
              {t('quiz.review.emptySubtitle')}
            </p>
            <div className="flex flex-col gap-3 w-full pt-1">
              <Link
                data-testid="review-empty-practice"
                href="/quiz/practice"
                className="w-full px-6 py-4 pill font-bold text-white text-center transition-opacity hover:opacity-90"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.95rem',
                  minHeight: '3.5rem',
                  lineHeight: '1.5rem',
                  backgroundColor: 'var(--accent)',
                }}
              >
                {t('quiz.review.emptyPractice')}
              </Link>
              <Link
                data-testid="review-empty-exam"
                href="/quiz"
                className="w-full px-6 py-4 pill font-bold text-center"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.95rem',
                  minHeight: '3.5rem',
                  lineHeight: '1.5rem',
                  backgroundColor: 'var(--surface-2)',
                  color: 'var(--ink)',
                  border: '2px solid var(--border)',
                }}
              >
                {t('quiz.review.emptyExam')}
              </Link>
            </div>
          </section>
        )}

        {!empty && (
          <Choice
            testId="review-length"
            label={t('quiz.review.lengthLabel')}
            options={REVIEW_LENGTHS.map((value) => ({
              value,
              label: t('quiz.review.lengthOption', { count: value }),
            }))}
            selected={length}
            onSelect={setLength}
            note={t('quiz.review.lengthNote')}
          />
        )}

        <section
          className="flex flex-col gap-4 card-rounded p-5 sm:p-7"
          style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
        >
          <div className="flex items-center gap-4">
            <Mascot mood="skeptical" size={56} />
            <ul className="flex flex-col gap-2">
              {[
                t('quiz.review.rules.pool'),
                t('quiz.review.rules.mastered', { count: masterySessions }),
                t('quiz.review.rules.everyMode'),
                t('quiz.review.rules.feedback'),
              ].map((rule) => (
                <li
                  key={rule}
                  className="flex gap-3"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.9rem',
                    color: 'var(--ink)',
                  }}
                >
                  <span aria-hidden style={{ color: 'var(--accent)', fontWeight: 800 }}>
                    ·
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The backend not answering is the only failure this screen has left:
            an empty pool is handled above, as the good news it is. */}
        {refused && (
          <div
            data-testid="review-unavailable"
            className="flex flex-col items-center gap-3 text-center py-4"
          >
            <Mascot mood="lost" size={64} />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                color: 'var(--ink)',
              }}
            >
              {t('quiz.unavailableTitle')}
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
              {t('quiz.unavailableSubtitle')}
            </p>
          </div>
        )}

        {!empty && (
          <button
            data-testid="review-start"
            onClick={start}
            disabled={starting || pending === undefined}
            className="w-full px-8 py-4 font-bold pill text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '1rem',
              minHeight: '3.5rem',
              backgroundColor: 'var(--accent)',
            }}
          >
            {starting ? t('quiz.review.starting') : t('quiz.review.cta')}
          </button>
        )}
      </main>
    </div>
  );
}
