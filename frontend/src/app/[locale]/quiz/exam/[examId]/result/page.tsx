'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { Breakdown } from '@/components/quiz/Breakdown';
import { fetchExam, gradeExam, startExam } from '@/lib/api';
import { PASS_MARK_PCT } from '@/lib/exam';
import { formatDuration } from '@/lib/examTime';
import { Exam, Language } from '@/types';

/** The one answer the student came for: a percentage and a plain verdict.
 *
 *  The Closed Questions are graded the moment the paper is handed in, so they
 *  are on screen straight away; the written ones are with the agent and land
 *  as they are done. Until every one of them is graded there is no score at
 *  all — a paper is not failed because a model call was slow. */
export default function ExamResultPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as Language;
  const router = useRouter();

  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [gradingFailed, setGradingFailed] = useState(false);

  // React StrictMode mounts twice in development, and grading is a model call.
  const grading = useRef(false);

  const grade = useCallback(async () => {
    if (grading.current) return;
    grading.current = true;
    setGradingFailed(false);

    const graded = await gradeExam(Number(examId), locale);
    grading.current = false;

    if (graded) {
      setExam(graded);
      return;
    }
    // Short of Verdicts: whatever came back was still kept, so pick that up
    // and let the student ask again rather than showing them a score built on
    // questions nobody read. If even that refetch fails, keep the paper
    // already on screen — the student is not shown less than they had.
    const refreshed = await fetchExam(Number(examId));
    if (refreshed) setExam(refreshed);
    setGradingFailed(true);
  }, [examId, locale]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await fetchExam(Number(examId));
      if (cancelled) return;

      // Landing here with the paper still open means the result does not exist
      // yet — back to the questions rather than to an empty verdict.
      if (loaded && loaded.status !== 'submitted') {
        router.replace(`/quiz/exam/${examId}`);
        return;
      }
      setExam(loaded);
      setLoading(false);
      if (loaded && !loaded.grading_complete) void grade();
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, router, grade]);

  const again = async () => {
    setStarting(true);
    const next = await startExam();
    if (!('started' in next)) {
      // Either the bank cannot fill a paper or another tab has one open. The
      // landing screen is where both are explained and where the second is
      // resolved, so that is where the player goes rather than nowhere.
      setStarting(false);
      router.push('/quiz');
      return;
    }
    router.push(`/quiz/exam/${next.started.id}`);
  };

  if (loading || !exam) {
    return (
      <ResultShell>
        <div
          data-testid="exam-result-loading"
          className="flex flex-col items-center gap-4 text-center py-16"
        >
          <Mascot mood="skeptical" size={72} />
          <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
            {t('quiz.result.loading')}
          </p>
        </div>
      </ResultShell>
    );
  }

  const passed = exam.passed === true;

  // No score yet: the agent is still on the written answers, or gave up on
  // some of them. Either way the Closed Questions below are already graded and
  // are shown — the student is not made to stare at a spinner for the whole
  // paper because fourteen of it are with a model.
  if (!exam.grading_complete) {
    return (
      <ResultShell>
        <StillGrading failed={gradingFailed} onRetry={() => void grade()} />
        <Breakdown questions={exam.questions} />
      </ResultShell>
    );
  }

  return (
    <ResultShell>
      <section
        data-testid="exam-result"
        data-passed={passed ? 'true' : 'false'}
        className="flex flex-col items-center gap-4 text-center card-rounded p-6 sm:p-8"
        style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
      >
        <Mascot mood={passed ? 'happy' : 'angry'} size={80} />

        <span
          data-testid="exam-verdict"
          className="px-5 py-1.5 pill font-bold text-white"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.78rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            backgroundColor: passed ? 'var(--correct)' : 'var(--primary)',
          }}
        >
          {passed ? t('quiz.result.verdictPassed') : t('quiz.result.verdictFailed')}
        </span>

        <p
          data-testid="exam-score-pct"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3rem, 18vw, 5rem)',
            lineHeight: '1',
            color: 'var(--primary)',
          }}
        >
          {exam.score_pct}%
        </p>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 6vw, 2rem)',
            color: 'var(--ink)',
          }}
        >
          {passed ? t('quiz.result.passedTitle') : t('quiz.result.failedTitle')}
        </h1>
        <p
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--muted)' }}
        >
          {passed ? t('quiz.result.passedSubtitle') : t('quiz.result.failedSubtitle')}
        </p>

        <dl className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-2">
          <Figure
            label={t('quiz.result.score', { score: exam.score ?? 0, total: exam.max_score })}
            testId="exam-score"
          />
          <Figure
            label={`${t('quiz.result.duration')}: ${formatDuration(exam.duration_seconds ?? 0)}`}
            testId="exam-duration"
          />
          <Figure label={t('quiz.result.passMark', { pct: PASS_MARK_PCT })} testId="exam-pass-mark" />
        </dl>
      </section>

      <Breakdown questions={exam.questions} />

      <div className="flex flex-col gap-3 pt-2">
        <button
          data-testid="exam-again"
          onClick={again}
          disabled={starting}
          className="w-full px-6 py-4 pill font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '1rem',
            minHeight: '3.5rem',
            backgroundColor: 'var(--accent)',
          }}
        >
          {starting ? t('quiz.start.starting') : t('quiz.result.again')}
        </button>
        <Link
          href="/"
          data-testid="exam-back-to-games"
          className="w-full px-6 py-4 pill font-bold text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '1rem',
            backgroundColor: 'var(--surface-2)',
            color: 'var(--ink)',
            border: '2px solid var(--border)',
          }}
        >
          {t('quiz.result.backToGames')}
        </Link>
      </div>
    </ResultShell>
  );
}

/** Where the verdict panel goes while there is no verdict. It says what is
 *  happening and, when the agent could not finish, offers the only thing that
 *  helps: asking again. Nothing here invents a score. */
function StillGrading({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const t = useTranslations();

  return (
    <section
      data-testid="exam-grading"
      data-failed={failed ? 'true' : 'false'}
      className="flex flex-col items-center gap-4 text-center card-rounded p-6 sm:p-8"
      style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
    >
      <Mascot mood={failed ? 'lost' : 'skeptical'} size={72} />
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.4rem, 5.5vw, 1.9rem)',
          color: 'var(--ink)',
        }}
      >
        {failed ? t('quiz.result.gradingStalledTitle') : t('quiz.result.gradingTitle')}
      </h1>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', color: 'var(--muted)' }}>
        {failed ? t('quiz.result.gradingStalledBody') : t('quiz.result.gradingBody')}
      </p>

      {failed ? (
        <button
          data-testid="exam-grading-retry"
          onClick={onRetry}
          className="w-full max-w-xs px-6 py-4 pill font-bold text-white transition-opacity hover:opacity-90"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.95rem',
            minHeight: '3.5rem',
            backgroundColor: 'var(--accent)',
          }}
        >
          {t('quiz.result.gradingRetry')}
        </button>
      ) : (
        <div
          aria-hidden
          className="w-full max-w-xs pill overflow-hidden"
          style={{ height: '6px', backgroundColor: 'var(--border)' }}
        >
          <div
            className="h-full pill animate-grading-sweep"
            style={{ width: '40%', backgroundColor: 'var(--accent)' }}
          />
        </div>
      )}
    </section>
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
        data-testid="exam-result-screen"
        className="flex-1 flex flex-col gap-4 w-full max-w-2xl mx-auto px-5 py-6 sm:px-8 sm:py-10"
      >
        {children}
      </main>
    </div>
  );
}
