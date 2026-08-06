'use client';
import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { Breakdown } from '@/components/quiz/Breakdown';
import { fetchPracticeSession } from '@/lib/api';
import { formatDuration } from '@/lib/examTime';
import { QuizSession } from '@/types';

/** How the Practice Session went — and nothing more than that.
 *
 *  There is no verdict here and there never will be: the only pass/fail number
 *  in the product is the Exam's, and a study tool that hands out verdicts stops
 *  being one. What this screen owes the student is the count, and then the
 *  question-by-question of what they got wrong. */
export default function PracticeResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const id = Number(sessionId);
  const t = useTranslations();
  const router = useRouter();

  const [session, setSession] = useState<QuizSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await fetchPracticeSession(id);
      if (cancelled) return;

      // Landing here with the Session still open means the result does not
      // exist yet — back to the questions rather than to an empty count.
      if (loaded && loaded.status === 'in_progress') {
        router.replace(`/quiz/practice/${id}`);
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
  }, [id, router]);

  if (loading || !session) {
    return (
      <ResultShell>
        <div
          data-testid="practice-result-loading"
          className="flex flex-col items-center gap-4 text-center py-16"
        >
          <Mascot mood="skeptical" size={72} />
          <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
            {t('quiz.practice.result.loading')}
          </p>
        </div>
      </ResultShell>
    );
  }

  // A Session ended before anything was answered has nothing to count, and says
  // so rather than showing a 0% that reads like a failure.
  const nothingAnswered = session.max_score === 0;

  return (
    <ResultShell>
      <section
        data-testid="practice-result"
        className="flex flex-col items-center gap-4 text-center card-rounded p-6 sm:p-8"
        style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
      >
        <Mascot mood={nothingAnswered ? 'lost' : 'happy'} size={80} />

        {!nothingAnswered && (
          <p
            data-testid="practice-score-pct"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(3rem, 18vw, 5rem)',
              lineHeight: '1',
              color: 'var(--primary)',
            }}
          >
            {session.score_pct}%
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
            ? t('quiz.practice.result.nothingTitle')
            : t('quiz.practice.result.title')}
        </h1>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--muted)' }}>
          {nothingAnswered
            ? t('quiz.practice.result.nothingSubtitle')
            : t('quiz.practice.result.subtitle')}
        </p>

        <dl className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-2">
          {!nothingAnswered && (
            <Figure
              testId="practice-score"
              label={t('quiz.practice.result.score', {
                score: session.score ?? 0,
                total: session.max_score,
              })}
            />
          )}
          {session.level !== null && (
            <Figure
              testId="practice-level-badge"
              label={t('quiz.practice.result.level', { level: session.level })}
            />
          )}
          <Figure
            testId="practice-duration"
            label={`${t('quiz.practice.result.duration')}: ${formatDuration(
              session.duration_seconds ?? 0
            )}`}
          />
        </dl>
      </section>

      <Breakdown questions={session.questions} />

      <div className="flex flex-col gap-3 pt-2">
        <Link
          data-testid="practice-again"
          href="/quiz/practice"
          className="w-full px-6 py-4 pill font-bold text-white text-center transition-opacity hover:opacity-90"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '1rem',
            backgroundColor: 'var(--accent)',
          }}
        >
          {t('quiz.practice.result.again')}
        </Link>
        <Link
          href="/quiz"
          data-testid="practice-back-to-quiz"
          className="w-full px-6 py-4 pill font-bold text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '1rem',
            backgroundColor: 'var(--surface-2)',
            color: 'var(--ink)',
            border: '2px solid var(--border)',
          }}
        >
          {t('quiz.practice.result.backToQuiz')}
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

function ResultShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main
        data-testid="practice-result-screen"
        className="flex-1 flex flex-col gap-4 w-full max-w-2xl mx-auto px-5 py-6 sm:px-8 sm:py-10"
      >
        {children}
      </main>
    </div>
  );
}
