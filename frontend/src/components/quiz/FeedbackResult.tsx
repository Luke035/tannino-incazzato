'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { Breakdown } from '@/components/quiz/Breakdown';
import { formatDuration } from '@/lib/examTime';
import { QuizSession } from '@/types';

/** How a Session in a mode that marks as it goes turned out — and nothing more
 *  than that.
 *
 *  There is no verdict here and there never will be: the only pass/fail number
 *  in the product is the Exam's, and a study tool that hands out verdicts stops
 *  being one. What this screen owes the student is the count, and then the
 *  question-by-question of what they got wrong. */
export interface FeedbackResultProps<S extends QuizSession> {
  sessionId: number;
  mode: 'practice' | 'review';
  copy: string;
  load: (id: number) => Promise<S | null>;
  /** Where "go again" leads — each mode's own setup screen. */
  againHref: string;
  /** Anything the mode wants under the count. Error Review puts how many
   *  questions are still waiting to be Mastered there: after a Session, that
   *  number is the only progress worth reporting. */
  aside?: (session: S) => React.ReactNode;
}

export function FeedbackResult<S extends QuizSession>({
  sessionId: id,
  mode,
  copy,
  load,
  againHref,
  aside,
}: FeedbackResultProps<S>) {
  const t = useTranslations();
  const router = useRouter();

  const [session, setSession] = useState<S | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await load(id);
      if (cancelled) return;

      // Landing here with the Session still open means the result does not
      // exist yet — back to the questions rather than to an empty count.
      if (loaded && loaded.status === 'in_progress') {
        router.replace(`/quiz/${mode}/${id}`);
        return;
      }
      if (!loaded || loaded.status === 'abandoned') {
        router.replace('/quiz');
        return;
      }
      setSession(loaded);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, mode, load, router]);

  if (loading || !session) {
    return (
      <ResultShell mode={mode}>
        <div
          data-testid={`${mode}-result-loading`}
          className="flex flex-col items-center gap-4 text-center py-16"
        >
          <Mascot mood="skeptical" size={72} />
          <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
            {t(`${copy}.result.loading`)}
          </p>
        </div>
      </ResultShell>
    );
  }

  // A Session ended before anything was answered has nothing to count, and says
  // so rather than showing a 0% that reads like a failure.
  const nothingAnswered = session.max_score === 0;

  return (
    <ResultShell mode={mode}>
      <section
        data-testid={`${mode}-result`}
        className="flex flex-col items-center gap-4 text-center card-rounded p-6 sm:p-8"
        style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
      >
        <Mascot mood={nothingAnswered ? 'lost' : 'happy'} size={80} />

        {/* A count, not a percentage. The Exam's recap leads on a big
            percentage under a PASSED/FAILED badge, and that whole shape reads
            as a verdict — which is the one thing this screen must not be. What
            a student takes from a study session is how many they got, and then
            which ones. */}
        {!nothingAnswered && (
          <p
            data-testid={`${mode}-score`}
            // Shown as a bare fraction and read out as a sentence: "7/10" is
            // the fastest thing to take in on a phone, and no use at all to a
            // screen reader.
            aria-label={t(`${copy}.result.score`, {
              score: session.score ?? 0,
              total: session.max_score,
            })}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.8rem, 16vw, 4.5rem)',
              lineHeight: '1',
              color: 'var(--primary)',
            }}
          >
            {session.score ?? 0}/{session.max_score}
          </p>
        )}

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 6vw, 2rem)',
            color: 'var(--ink)',
          }}
        >
          {nothingAnswered
            ? t(`${copy}.result.nothingTitle`)
            : t(`${copy}.result.title`)}
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--muted)' }}>
          {nothingAnswered
            ? t(`${copy}.result.nothingSubtitle`)
            : t(`${copy}.result.subtitle`)}
        </p>

        {aside?.(session)}

        <dl className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-2">
          {/* Practice is drawn from one Level and says which. Error Review has
              no Level at all — the pool spans whatever the player has answered
              — so this simply does not render there. */}
          {session.level !== null && (
            <Figure
              testId={`${mode}-level-badge`}
              label={t(`${copy}.result.level`, { level: session.level })}
            />
          )}
          <Figure
            testId={`${mode}-duration`}
            label={`${t(`${copy}.result.duration`)}: ${formatDuration(
              session.duration_seconds ?? 0
            )}`}
          />
        </dl>
      </section>

      <Breakdown questions={session.questions} />

      <div className="flex flex-col gap-3 pt-2">
        <Link
          data-testid={`${mode}-again`}
          href={againHref}
          className="w-full px-6 py-4 pill font-bold text-white text-center transition-opacity hover:opacity-90"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '1rem',
            backgroundColor: 'var(--accent)',
          }}
        >
          {t(`${copy}.result.again`)}
        </Link>
        <Link
          href="/quiz"
          data-testid={`${mode}-back-to-quiz`}
          className="w-full px-6 py-4 pill font-bold text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '1rem',
            backgroundColor: 'var(--surface-2)',
            color: 'var(--ink)',
            border: '2px solid var(--border)',
          }}
        >
          {t(`${copy}.result.backToQuiz`)}
        </Link>
      </div>
    </ResultShell>
  );
}

function Figure({ label, testId }: { label: string; testId: string }) {
  return (
    <dd
      data-testid={testId}
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.85rem',
        fontWeight: 700,
        color: 'var(--ink)',
      }}
    >
      {label}
    </dd>
  );
}

function ResultShell({ mode, children }: { mode: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main
        data-testid={`${mode}-result-screen`}
        className="flex-1 flex flex-col gap-4 w-full max-w-2xl mx-auto px-5 py-6 sm:px-8 sm:py-10"
      >
        {children}
      </main>
    </div>
  );
}
