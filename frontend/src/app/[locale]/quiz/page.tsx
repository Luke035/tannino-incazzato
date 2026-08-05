'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { ConfirmSheet } from '@/components/quiz/ConfirmSheet';
import { abandonExam, ExamRefusal, fetchCurrentExam, startExam } from '@/lib/api';
import { answeredCount, EXAM_COMPOSITION, EXAM_LENGTH, PASS_MARK_PCT } from '@/lib/exam';
import { Exam } from '@/types';

// Mobile-first by design: every control below is reachable with one thumb.
export default function QuizPage() {
  const t = useTranslations();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  // Why the last attempt to draw a paper came to nothing, if it did. The bank
  // being too thin and the backend being unreachable are different things and
  // are never told to the player as the same thing.
  const [refused, setRefused] = useState<ExamRefusal | null>(null);
  // The paper the player walked away from, if there is one. A player has at
  // most one Session open at a time, so this is either the Session or nothing.
  const [openExam, setOpenExam] = useState<Exam | null>(null);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await fetchCurrentExam();
      if (!cancelled) setOpenExam(current);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async () => {
    setStarting(true);
    setRefused(null);
    const result = await startExam();

    if ('started' in result) {
      router.push(`/quiz/exam/${result.started.id}`);
      return;
    }
    setStarting(false);
    // Another tab got there first. Nothing was drawn and nothing was lost:
    // show the Session that is open and let the player choose.
    if (result.refused === 'in_progress') {
      setOpenExam(await fetchCurrentExam());
      return;
    }
    setRefused(result.refused);
  };

  const abandon = useCallback(async () => {
    if (!openExam) return;
    setAbandoning(true);
    const dropped = await abandonExam(openExam.id);
    setAbandoning(false);
    setConfirmingAbandon(false);
    // Refetched rather than assumed: if the slot was not freed, the panel has
    // to keep saying so instead of offering a start that would be refused.
    setOpenExam(dropped ? null : await fetchCurrentExam());
  }, [openExam]);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main
        data-testid="quiz-screen"
        className="flex-1 flex flex-col gap-6 w-full max-w-2xl mx-auto px-5 py-8 sm:px-8 sm:py-12"
      >
        <Link
          href="/"
          className="font-bold self-start"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          {t('home.backToGames')}
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
            {t('quiz.eyebrow')}
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
            {t('quiz.start.title')}
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', color: 'var(--muted)' }}>
            {t('quiz.start.subtitle', { count: EXAM_LENGTH })}
          </p>
        </div>

        {openExam && (
          <ResumePanel
            exam={openExam}
            onAbandon={() => setConfirmingAbandon(true)}
          />
        )}

        <section
          className="flex flex-col gap-4 card-rounded p-5 sm:p-7"
          style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
        >
          <div className="flex items-center gap-4">
            <Mascot mood="skeptical" size={56} />
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.88rem',
                color: 'var(--muted)',
              }}
            >
              {t('quiz.start.composition', {
                open: EXAM_COMPOSITION.open,
                multipleChoice: EXAM_COMPOSITION.multiple_choice,
                trueFalse: EXAM_COMPOSITION.true_false,
              })}
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {[
              t('quiz.start.rules.length', { count: EXAM_LENGTH }),
              t('quiz.start.rules.levels'),
              t('quiz.start.rules.passMark', { pct: PASS_MARK_PCT }),
              t('quiz.start.rules.timer'),
            ].map((rule) => (
              <li
                key={rule}
                className="flex gap-3"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.92rem',
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
        </section>

        {/* The bank being too thin is a fact about the game; anything else is
            the backend not answering, and the player is told which. */}
        {refused && (
          <div
            data-testid={refused === 'bank_too_small' ? 'quiz-empty' : 'quiz-unavailable'}
            className="flex flex-col items-center gap-3 text-center py-6"
          >
            <Mascot mood="lost" size={64} />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                color: 'var(--ink)',
              }}
            >
              {refused === 'bank_too_small' ? t('quiz.emptyTitle') : t('quiz.unavailableTitle')}
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
              {refused === 'bank_too_small'
                ? t('quiz.emptySubtitle')
                : t('quiz.unavailableSubtitle')}
            </p>
          </div>
        )}

        {/* A new paper is not on offer while one is open: the way past this
            screen is to pick the old one up or to bin it on purpose. */}
        {!openExam && (
          <button
            data-testid="exam-start"
            onClick={start}
            disabled={starting}
            className="w-full px-8 py-4 font-bold pill text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '1rem',
              minHeight: '3.5rem',
              backgroundColor: 'var(--accent)',
            }}
          >
            {starting ? t('quiz.start.starting') : t('quiz.start.cta')}
          </button>
        )}
      </main>

      {confirmingAbandon && openExam && (
        <ConfirmSheet
          testId="exam-abandon-warning"
          confirmTestId="exam-abandon-confirm"
          cancelTestId="exam-abandon-cancel"
          title={t('quiz.resume.warn.title')}
          body={t('quiz.resume.warn.body', { count: answeredCount(openExam.questions) })}
          confirmLabel={
            abandoning ? t('quiz.resume.warn.abandoning') : t('quiz.resume.warn.confirm')
          }
          cancelLabel={t('quiz.resume.warn.cancel')}
          busy={abandoning}
          onConfirm={() => void abandon()}
          onCancel={() => setConfirmingAbandon(false)}
        />
      )}
    </div>
  );
}

/** What a student who was interrupted comes back to: what is open, how far it
 *  got, and the two ways out of it. */
function ResumePanel({ exam, onAbandon }: { exam: Exam; onAbandon: () => void }) {
  const t = useTranslations();
  const answered = answeredCount(exam.questions);

  return (
    <section
      data-testid="exam-in-progress"
      className="flex flex-col gap-4 card-rounded p-5 sm:p-7"
      style={{ backgroundColor: 'var(--surface-2)', border: '2px solid var(--accent)' }}
    >
      <div className="flex items-center gap-4">
        <Mascot mood="skeptical" size={52} />
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              color: 'var(--ink)',
            }}
          >
            {t('quiz.resume.title')}
          </h2>
          <p
            data-testid="exam-in-progress-answered"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--muted)' }}
          >
            {t('quiz.resume.progress', { answered, total: exam.questions.length })}
          </p>
        </div>
      </div>

      <Link
        data-testid="exam-resume"
        href={`/quiz/exam/${exam.id}`}
        className="w-full px-8 py-4 font-bold pill text-white text-center transition-opacity hover:opacity-90"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '1rem',
          minHeight: '3.5rem',
          lineHeight: '1.5rem',
          backgroundColor: 'var(--accent)',
        }}
      >
        {t('quiz.resume.cta')}
      </Link>

      <button
        data-testid="exam-abandon"
        onClick={onAbandon}
        className="w-full py-3 pill font-bold"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.85rem',
          minHeight: '2.75rem',
          color: 'var(--rust)',
          backgroundColor: 'transparent',
        }}
      >
        {t('quiz.resume.abandon')}
      </button>
    </section>
  );
}

