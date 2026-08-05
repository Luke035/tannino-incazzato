'use client';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { ConfirmSheet } from '@/components/quiz/ConfirmSheet';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { fetchExam, saveExamAnswer, submitExam } from '@/lib/api';
import { isBlank, OPEN_ANSWER_SAVE_DELAY_MS } from '@/lib/exam';
import { formatDuration, useElapsedSeconds } from '@/lib/examTime';
import { Exam } from '@/types';

type View = 'question' | 'review';

/** Sitting the Exam: one question per screen, back and forth as often as the
 *  student likes, then a look over the whole paper before handing it in. */
export default function ExamSittingPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = use(params);
  const t = useTranslations();
  const router = useRouter();

  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<number, string | null>>({});
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>('question');
  const [warning, setWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const elapsed = useElapsedSeconds(exam?.started_at ?? null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await fetchExam(Number(examId));
      if (cancelled) return;

      if (loaded?.status === 'submitted') {
        router.replace(`/quiz/exam/${examId}/result`);
        return;
      }
      // Binned from the landing screen, or from another tab. There is nothing
      // to sit and nothing to show: back to where a new paper is drawn.
      if (loaded?.status === 'abandoned') {
        router.replace('/quiz');
        return;
      }
      // Whatever was already answered comes back with the paper, so an Exam
      // interrupted by a phone call resumes where it was left.
      if (loaded) {
        setAnswers(
          Object.fromEntries(loaded.questions.map((q) => [q.question_id, q.answer]))
        );
      }
      setExam(loaded);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, router]);

  const questions = useMemo(() => exam?.questions ?? [], [exam]);
  const blanks = useMemo(
    () => questions.filter((q) => isBlank(answers[q.question_id])),
    [questions, answers]
  );

  // Answers whose write did not land. The screen shows them as given, so they
  // are resent before handing in: a dropped request must never turn an answer
  // the student gave into a blank the backend marks wrong.
  const unsaved = useRef(new Map<number, string>());
  // A written answer typed but not yet sent. Every keystroke is a request
  // otherwise, and a paragraph is a hundred of them.
  const typing = useRef(new Map<number, string>());
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(
    (questionId: number, value: string) =>
      saveExamAnswer(Number(examId), questionId, value).then((saved) => {
        if (saved) unsaved.current.delete(questionId);
        else unsaved.current.set(questionId, value);
      }),
    [examId]
  );

  /** Sends everything typed but not yet written. Called before leaving a
   *  question and before handing in, so no answer is ever lost to the delay. */
  const flushTyping = useCallback(async () => {
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    const pending = [...typing.current.entries()];
    typing.current.clear();
    await Promise.all(pending.map(([questionId, value]) => send(questionId, value)));
  }, [send]);

  const answer = useCallback(
    (questionId: number, value: string, typed = false) => {
      // The screen updates on the tap; the write is what makes it survive a
      // reload, not what makes it visible.
      setAnswers((current) => ({ ...current, [questionId]: value }));

      if (!typed) {
        void send(questionId, value);
        return;
      }

      typing.current.set(questionId, value);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => void flushTyping(), OPEN_ANSWER_SAVE_DELAY_MS);
    },
    [send, flushTyping]
  );

  // Leaving the question is the moment the answer on it has to be safe.
  useEffect(() => {
    return () => {
      void flushTyping();
    };
  }, [index, view, flushTyping]);

  // The tab being closed, the phone being locked, the student switching apps:
  // none of those run a React cleanup, and all of them are exactly the
  // interruption this game promises to survive. A written answer typed in the
  // last breath before one of them is sent here — `saveExamAnswer` marks the
  // request `keepalive`, which is what lets it outlive the page.
  useEffect(() => {
    const flush = () => void flushTyping();
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushIfHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushIfHidden);
    };
  }, [flushTyping]);

  const handIn = useCallback(async () => {
    setSubmitting(true);
    await flushTyping();

    const retries = [...unsaved.current.entries()];
    await Promise.all(
      retries.map(async ([questionId, value]) => {
        if (await saveExamAnswer(Number(examId), questionId, value)) {
          unsaved.current.delete(questionId);
        }
      })
    );

    const result = await submitExam(Number(examId));
    if (!result) {
      // The paper would not be taken. Usually that is the same paper having
      // been handed in or binned in another tab, so ask what became of it
      // rather than leaving a tapped button that does nothing.
      const paper = await fetchExam(Number(examId));
      if (paper?.status === 'submitted') {
        router.replace(`/quiz/exam/${examId}/result`);
        return;
      }
      if (!paper || paper.status === 'abandoned') {
        router.replace('/quiz');
        return;
      }
      setSubmitting(false);
      setWarning(false);
      return;
    }
    router.replace(`/quiz/exam/${examId}/result`);
  }, [examId, router, flushTyping]);

  if (loading) {
    return (
      <ExamShell>
        <div data-testid="exam-loading" className="flex flex-col items-center gap-4 text-center py-16">
          <Mascot mood="lost" size={72} />
          <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
            {t('quiz.loading')}
          </p>
        </div>
      </ExamShell>
    );
  }

  if (!exam) {
    return (
      <ExamShell>
        <div data-testid="exam-not-found" className="flex flex-col items-center gap-4 text-center py-16">
          <Mascot mood="skeptical" size={72} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
            {t('quiz.exam.notFoundTitle')}
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
            {t('quiz.exam.notFoundSubtitle')}
          </p>
          <Link
            href="/quiz"
            className="px-6 py-3 pill font-bold text-white"
            style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--accent)' }}
          >
            {t('quiz.start.cta')}
          </Link>
        </div>
      </ExamShell>
    );
  }

  const current = questions[index];
  const total = questions.length;

  return (
    <ExamShell>
      {/* Progress and clock stay put while the questions move under them. */}
      <div className="flex items-center justify-between gap-3">
        <span
          data-testid="exam-progress"
          className="px-4 py-1.5 pill font-bold text-white"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.78rem',
            backgroundColor: 'var(--primary)',
          }}
        >
          {t('quiz.exam.progress', { current: index + 1, total })}
        </span>
        <span
          data-testid="exam-elapsed"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.82rem',
            color: 'var(--muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {t('quiz.exam.elapsed')} {formatDuration(elapsed)}
        </span>
      </div>

      <div
        aria-hidden
        className="w-full pill overflow-hidden"
        style={{ height: '6px', backgroundColor: 'var(--border)' }}
      >
        <div
          className="h-full pill transition-all"
          style={{
            width: `${((index + 1) / total) * 100}%`,
            backgroundColor: 'var(--accent)',
          }}
        />
      </div>

      {view === 'question' && current && (
        <>
          <QuestionCard
            question={current}
            answer={answers[current.question_id] ?? null}
            onAnswer={(value) =>
              answer(current.question_id, value, current.format === 'open')
            }
          />

          {/* Bottom of the screen: where a thumb already is. */}
          <div className="flex gap-3 mt-auto pt-2">
            <button
              data-testid="exam-back"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="px-6 py-4 pill font-bold transition-opacity disabled:opacity-40"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.95rem',
                minHeight: '3.5rem',
                backgroundColor: 'var(--surface-2)',
                color: 'var(--ink)',
                border: '2px solid var(--border)',
              }}
            >
              {t('quiz.exam.back')}
            </button>
            <button
              data-testid="exam-next"
              onClick={() =>
                index === total - 1 ? setView('review') : setIndex((i) => i + 1)
              }
              className="flex-1 px-6 py-4 pill font-bold text-white transition-opacity hover:opacity-90"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.95rem',
                minHeight: '3.5rem',
                backgroundColor: 'var(--accent)',
              }}
            >
              {index === total - 1
                ? t('quiz.exam.toReview')
                : answers[current.question_id]?.trim()
                  ? t('quiz.exam.next')
                  : t('quiz.exam.skip')}
            </button>
          </div>

          {/* Handing in must be reachable from anywhere on the paper: nobody
              taps Next twenty-five times to leave a Session they want to end. */}
          {index < total - 1 && (
            <button
              data-testid="exam-to-review"
              onClick={() => setView('review')}
              className="w-full py-3 pill font-bold"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.85rem',
                minHeight: '2.75rem',
                color: 'var(--accent)',
                backgroundColor: 'transparent',
              }}
            >
              {t('quiz.exam.toReview')}
            </button>
          )}
        </>
      )}

      {view === 'review' && (
        <ReviewPanel
          questions={questions}
          answers={answers}
          blanks={blanks.length}
          submitting={submitting}
          onJump={(position) => {
            setIndex(position);
            setView('question');
          }}
          onKeepWorking={() => setView('question')}
          onSubmit={() => (blanks.length > 0 ? setWarning(true) : void handIn())}
        />
      )}

      {warning && (
        <ConfirmSheet
          testId="exam-blanks-warning"
          confirmTestId="exam-submit-anyway"
          cancelTestId="exam-cancel-submit"
          title={t('quiz.exam.warn.title')}
          body={t('quiz.exam.warn.body', { count: blanks.length })}
          confirmLabel={t('quiz.exam.warn.confirm')}
          cancelLabel={t('quiz.exam.warn.cancel')}
          busy={submitting}
          onConfirm={() => void handIn()}
          onCancel={() => setWarning(false)}
        />
      )}
    </ExamShell>
  );
}

function ExamShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main
        data-testid="exam-screen"
        className="flex-1 flex flex-col gap-4 w-full max-w-2xl mx-auto px-5 py-6 sm:px-8 sm:py-10"
      >
        {children}
      </main>
    </div>
  );
}

/** The last look before handing in. Blanks are the whole point of this screen:
 *  submitting early must always be a choice, never a slip. */
function ReviewPanel({
  questions,
  answers,
  blanks,
  submitting,
  onJump,
  onKeepWorking,
  onSubmit,
}: {
  questions: Exam['questions'];
  answers: Record<number, string | null>;
  blanks: number;
  submitting: boolean;
  onJump: (position: number) => void;
  onKeepWorking: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations();

  return (
    <section data-testid="exam-review" className="flex flex-col gap-5 flex-1">
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 6vw, 2rem)',
            color: 'var(--ink)',
          }}
        >
          {t('quiz.exam.review.title')}
        </h1>
        <p
          data-testid="exam-blanks"
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', color: 'var(--muted)' }}
        >
          {blanks > 0
            ? t('quiz.exam.review.blanks', { count: blanks })
            : t('quiz.exam.review.allAnswered')}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
        {questions.map((question, position) => {
          const blank = !answers[question.question_id];
          return (
            <button
              key={question.question_id}
              data-testid={blank ? 'exam-review-blank' : 'exam-review-answered'}
              aria-label={`${position + 1} — ${
                blank ? t('quiz.exam.review.blank') : t('quiz.exam.review.answered')
              }`}
              onClick={() => onJump(position)}
              className="pill font-bold transition-colors"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.9rem',
                minHeight: '3rem',
                backgroundColor: blank ? 'var(--surface)' : 'var(--correct)',
                color: blank ? 'var(--rust)' : 'white',
                border: `2px solid ${blank ? 'var(--rust)' : 'var(--correct)'}`,
              }}
            >
              {position + 1}
            </button>
          );
        })}
      </div>

      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--faint)' }}>
        {t('quiz.exam.review.jumpHint')}
      </p>

      <div className="flex gap-3 mt-auto pt-2">
        <button
          data-testid="exam-keep-working"
          onClick={onKeepWorking}
          className="px-6 py-4 pill font-bold"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.95rem',
            minHeight: '3.5rem',
            backgroundColor: 'var(--surface-2)',
            color: 'var(--ink)',
            border: '2px solid var(--border)',
          }}
        >
          {t('quiz.exam.review.keepWorking')}
        </button>
        <button
          data-testid="exam-submit"
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 px-6 py-4 pill font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.95rem',
            minHeight: '3.5rem',
            backgroundColor: 'var(--primary)',
          }}
        >
          {t('quiz.exam.review.submit')}
        </button>
      </div>
    </section>
  );
}
