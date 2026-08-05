'use client';
import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { optionLabel } from '@/components/quiz/QuestionCard';
import { fetchExam, startExam } from '@/lib/api';
import { PASS_MARK_PCT } from '@/lib/exam';
import { formatDuration } from '@/lib/examTime';
import { Exam } from '@/types';

/** The one answer the student came for: a percentage and a plain verdict. */
export default function ExamResultPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const t = useTranslations();
  const router = useRouter();

  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

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
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, router]);

  const again = async () => {
    setStarting(true);
    const next = await startExam();
    if (!next) {
      setStarting(false);
      return;
    }
    router.push(`/quiz/exam/${next.id}`);
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

      <h2
        className="pt-2"
        style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--ink)' }}
      >
        {t('quiz.result.breakdown')}
      </h2>

      <ol className="flex flex-col gap-3">
        {exam.questions.map((question, position) => {
          const correct = question.verdict === 'correct';
          return (
            <li
              key={question.question_id}
              data-testid={correct ? 'exam-answer-correct' : 'exam-answer-wrong'}
              className="flex flex-col gap-2 card-rounded p-4"
              style={{
                backgroundColor: 'var(--surface)',
                border: `2px solid ${correct ? 'var(--correct)' : 'var(--rust)'}`,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  color: correct ? 'var(--correct)' : 'var(--rust)',
                }}
              >
                {position + 1}
              </span>
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1rem',
                  lineHeight: '1.35',
                  color: 'var(--ink)',
                }}
              >
                {question.text}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  color: 'var(--muted)',
                }}
              >
                {t('quiz.result.yourAnswer')}:{' '}
                <strong style={{ color: correct ? 'var(--correct)' : 'var(--rust)' }}>
                  {question.answer
                    ? optionLabel(question, question.answer, t)
                    : t('quiz.result.noAnswer')}
                </strong>
              </p>
              {/* A wrong answer leaves the recap knowing more than it arrived with. */}
              {!correct && question.correct_answer && (
                <p
                  data-testid="exam-correct-answer"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.85rem',
                    color: 'var(--ink)',
                  }}
                >
                  {t('quiz.result.correctAnswer')}:{' '}
                  <strong>{optionLabel(question, question.correct_answer, t)}</strong>
                </p>
              )}
            </li>
          );
        })}
      </ol>

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
