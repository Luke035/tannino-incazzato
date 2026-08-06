'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { ConfirmSheet } from '@/components/quiz/ConfirmSheet';
import { optionLabel, QuestionCard } from '@/components/quiz/QuestionCard';
import { isBlank } from '@/lib/exam';
import { ExamQuestion, Language, PracticeAnswerResult, QuizSession } from '@/types';

/** A Session in a mode that marks as it goes: one question, one answer, one
 *  correction, next. Practice and Error Review are the same screen — they
 *  differ in where the questions came from, which is a backend question, and in
 *  what the copy calls things.
 *
 *  The Exam's back-and-forth is deliberately absent. Once a question has been
 *  marked it is closed — being shown the right answer and then being allowed to
 *  change yours is not studying, and the backend refuses it anyway. What
 *  replaces it is the correction landing immediately, while the student still
 *  remembers why they answered what they did. */
export interface FeedbackSittingProps<S extends QuizSession> {
  sessionId: number;
  /** Prefixes every `data-testid` on the screen, so each mode is addressable on
   *  its own without either of them having to invent a second vocabulary. */
  mode: 'practice' | 'review';
  /** The message namespace this mode's copy lives under, e.g. `quiz.practice`. */
  copy: string;
  load: (id: number) => Promise<S | null>;
  save: (
    id: number,
    questionId: number,
    answer: string,
    language: Language
  ) => Promise<PracticeAnswerResult | null>;
  finish: (id: number) => Promise<S | null>;
  /** Where "start a fresh one" goes when this Session turns out not to exist. */
  setupHref: string;
  /** Anything the mode wants beside the tally — Error Review puts the number of
   *  questions still waiting to be Mastered there, because watching it fall is
   *  the whole point of sitting the Session. */
  aside?: (session: S) => React.ReactNode;
}

export function FeedbackSitting<S extends QuizSession>({
  sessionId: id,
  mode,
  copy,
  load,
  save,
  finish,
  setupHref,
  aside,
}: FeedbackSittingProps<S>) {
  const t = useTranslations();
  const locale = useLocale() as Language;
  const router = useRouter();

  const [session, setSession] = useState<S | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  // What has been marked so far, keyed by question. Seeded from the Session on
  // load, so a student who closed the tab comes back to the corrections they
  // already had rather than to a blank slate.
  const [marked, setMarked] = useState<Record<number, PracticeAnswerResult>>({});
  // What the student has put into the question on screen but has not had marked
  // yet — the option they just tapped, or the written answer they are still
  // typing. Unlike the Exam it is not saved as it is typed: here sending it *is*
  // asking for the correction, so it happens once, when they are ready. Holding
  // a tapped option here too is what makes the tap show up straight away rather
  // than only when the correction lands.
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  // The agent could not read the written answer. Not a wrong answer, and never
  // shown as one: the question stays open and sending it again is the retry.
  const [stalled, setStalled] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await load(id);
      if (cancelled) return;

      if (loaded?.status === 'submitted') {
        router.replace(`/quiz/${mode}/${id}/result`);
        return;
      }
      // Binned from the landing screen, or from another tab. There is nothing
      // to sit and nothing to show.
      if (loaded?.status === 'abandoned') {
        router.replace('/quiz');
        return;
      }
      if (loaded) {
        setMarked(
          Object.fromEntries(
            loaded.questions
              .filter((question) => question.verdict !== null)
              .map((question) => [question.question_id, toResult(question)])
          )
        );
        // Back to the first question still without a correction: an
        // interruption costs the student their place and nothing more.
        const next = loaded.questions.findIndex((question) => question.verdict === null);
        setIndex(next === -1 ? Math.max(0, loaded.questions.length - 1) : next);
      }
      setSession(loaded);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, mode, load, router]);

  const questions = useMemo(() => session?.questions ?? [], [session]);
  const current: ExamQuestion | undefined = questions[index];
  const result = current ? (marked[current.question_id] ?? null) : null;
  const answered = Object.keys(marked).length;
  const right = Object.values(marked).filter((one) => one.verdict === 'correct').length;
  const last = index === questions.length - 1;

  const check = useCallback(
    async (value: string) => {
      if (!current || checking || isBlank(value)) return;
      setChecking(true);
      setStalled(false);

      const answer = await save(id, current.question_id, value, locale);
      setChecking(false);

      // No answer at all, or one the agent could not read. Neither is a wrong
      // answer, and neither is shown as one — the student is told what
      // happened and offered the only thing that helps: asking again.
      if (!answer || answer.verdict === null) {
        setStalled(true);
        return;
      }
      setMarked((current) => ({ ...current, [answer.question_id]: answer }));
    },
    [id, locale, current, checking, save]
  );

  const end = useCallback(async () => {
    setEnding(true);
    const finished = await finish(id);
    if (!finished) {
      // Usually the same Session having been ended or binned in another tab.
      // Ask what became of it rather than leaving a tapped button doing
      // nothing.
      setEnding(false);
      setConfirmEnd(false);
      const paper = await load(id);
      if (paper?.status === 'submitted') router.replace(`/quiz/${mode}/${id}/result`);
      else if (!paper || paper.status === 'abandoned') router.replace('/quiz');
      return;
    }
    router.replace(`/quiz/${mode}/${id}/result`);
  }, [id, mode, finish, load, router]);

  if (loading) {
    return (
      <SittingShell mode={mode}>
        <Waiting testId={`${mode}-loading`} mood="lost" message={t(`${copy}.loading`)} />
      </SittingShell>
    );
  }

  if (!session || !current) {
    return (
      <SittingShell mode={mode}>
        <div
          data-testid={`${mode}-not-found`}
          className="flex flex-col items-center gap-4 text-center py-16"
        >
          <Mascot mood="skeptical" size={72} />
          <h1
            style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}
          >
            {t(`${copy}.notFoundTitle`)}
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
            {t(`${copy}.notFoundSubtitle`)}
          </p>
          <Link
            href={setupHref}
            className="px-6 py-3 pill font-bold text-white"
            style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--accent)' }}
          >
            {t(`${copy}.cta`)}
          </Link>
        </div>
      </SittingShell>
    );
  }

  const answer = result?.answer ?? (draft || null);

  return (
    <SittingShell mode={mode}>
      <div className="flex items-center justify-between gap-3">
        <span
          data-testid={`${mode}-progress`}
          className="px-4 py-1.5 pill font-bold text-white"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.78rem',
            backgroundColor: 'var(--primary)',
          }}
        >
          {t(`${copy}.progress`, { current: index + 1, total: questions.length })}
        </span>
        {/* A tally, not a verdict: nothing here is passed or failed. */}
        <span
          data-testid={`${mode}-tally`}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.82rem',
            color: 'var(--muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {t(`${copy}.tally`, { count: right })}
        </span>
      </div>

      {aside?.(session)}

      <div
        aria-hidden
        className="w-full pill overflow-hidden"
        style={{ height: '6px', backgroundColor: 'var(--border)' }}
      >
        <div
          className="h-full pill transition-all"
          style={{
            width: `${((index + 1) / questions.length) * 100}%`,
            backgroundColor: 'var(--accent)',
          }}
        />
      </div>

      <QuestionCard
        question={current}
        answer={answer}
        busy={checking}
        reveal={
          result?.verdict
            ? { verdict: result.verdict, correctAnswer: result.correct_answer }
            : null
        }
        onAnswer={(value) => {
          setDraft(value);
          // A Closed Question is answered by tapping, and the tap is the
          // decision — there is nothing to confirm. A written one is typed
          // first and sent when the student says so.
          if (current.format !== 'open') void check(value);
        }}
      />

      {/* Only a written answer is ever waited on: a Closed Question is marked
          by comparison and comes back before there is anything to show. */}
      {checking && current.format === 'open' && (
        <Waiting
          testId={`${mode}-checking`}
          mood="skeptical"
          message={t(`${copy}.checking`)}
        />
      )}

      {result && <Correction mode={mode} copy={copy} question={current} result={result} />}

      {stalled && !result && (
        <section
          data-testid={`${mode}-stalled`}
          className="flex flex-col items-center gap-3 text-center card-rounded p-5"
          style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
        >
          <Mascot mood="lost" size={56} />
          <h2
            style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--ink)' }}
          >
            {t(`${copy}.stalledTitle`)}
          </h2>
          <p
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--muted)' }}
          >
            {t(`${copy}.stalledBody`)}
          </p>
          <button
            data-testid={`${mode}-retry`}
            onClick={() => void check(answer ?? '')}
            className="w-full max-w-xs px-6 py-4 pill font-bold text-white transition-opacity hover:opacity-90"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.95rem',
              minHeight: '3.5rem',
              backgroundColor: 'var(--accent)',
            }}
          >
            {t(`${copy}.retry`)}
          </button>
        </section>
      )}

      <div className="flex flex-col gap-3 mt-auto pt-2">
        {/* One button that changes what it does: mark this answer, or move on
            once it has been marked. It is always in the same place, which is
            where the thumb already is. */}
        {result ? (
          <button
            data-testid={`${mode}-next`}
            onClick={() => {
              if (last) {
                void end();
                return;
              }
              setStalled(false);
              setDraft('');
              setIndex((position) => position + 1);
            }}
            disabled={ending}
            className="w-full px-6 py-4 pill font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.95rem',
              minHeight: '3.5rem',
              backgroundColor: 'var(--accent)',
            }}
          >
            {last ? t(`${copy}.toResult`) : t(`${copy}.next`)}
          </button>
        ) : (
          current.format === 'open' && (
            <button
              data-testid={`${mode}-check`}
              onClick={() => void check(draft)}
              disabled={checking || isBlank(draft)}
              className="w-full px-6 py-4 pill font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.95rem',
                minHeight: '3.5rem',
                backgroundColor: 'var(--accent)',
              }}
            >
              {checking ? t(`${copy}.checking`) : t(`${copy}.check`)}
            </button>
          )
        )}

        {/* Ending early is always on offer: a study tool must never be a trap. */}
        <button
          data-testid={`${mode}-end`}
          onClick={() => setConfirmEnd(true)}
          className="w-full py-3 pill font-bold"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.85rem',
            minHeight: '2.75rem',
            color: 'var(--rust)',
            backgroundColor: 'transparent',
          }}
        >
          {t(`${copy}.end`)}
        </button>
      </div>

      {confirmEnd && (
        <ConfirmSheet
          testId={`${mode}-end-warning`}
          confirmTestId={`${mode}-end-confirm`}
          cancelTestId={`${mode}-end-cancel`}
          title={t(`${copy}.endWarn.title`)}
          body={t(`${copy}.endWarn.body`, { count: answered })}
          confirmLabel={t(`${copy}.endWarn.confirm`)}
          cancelLabel={t(`${copy}.endWarn.cancel`)}
          busy={ending}
          onConfirm={() => void end()}
          onCancel={() => setConfirmEnd(false)}
        />
      )}
    </SittingShell>
  );
}

/** The correction, immediately after the answer. This panel is the mode: it is
 *  why a student studies here rather than sitting exam after exam. */
function Correction({
  mode,
  copy,
  question,
  result,
}: {
  mode: string;
  copy: string;
  question: ExamQuestion;
  result: PracticeAnswerResult;
}) {
  const t = useTranslations();
  const correct = result.verdict === 'correct';
  const edge = correct ? 'var(--correct)' : 'var(--rust)';

  return (
    <section
      data-testid={correct ? `${mode}-correct` : `${mode}-wrong`}
      className="flex flex-col gap-3 card-rounded p-5"
      style={{ backgroundColor: 'var(--surface)', border: `2px solid ${edge}` }}
    >
      <div className="flex items-center gap-3">
        <Mascot mood={correct ? 'happy' : 'skeptical'} size={48} />
        <h2
          data-testid={`${mode}-verdict`}
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: edge }}
        >
          {correct ? t(`${copy}.correct`) : t(`${copy}.wrong`)}
        </h2>
      </div>

      {/* Only when it was got wrong: telling a student the answer they just
          gave is noise, and pushes the useful half off the screen. */}
      {!correct && result.correct_answer && (
        <p
          data-testid={`${mode}-correct-answer`}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--ink)' }}
        >
          {t(`${copy}.correctAnswer`)}:{' '}
          <strong>{optionLabel(question, result.correct_answer, t)}</strong>
        </p>
      )}

      {/* Written answers only, and always the agent's note on this student's
          own answer — never the bank's explanation of the question. */}
      {result.feedback && (
        <p
          data-testid={`${mode}-feedback`}
          className="card-rounded p-3"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.88rem',
            lineHeight: '1.45',
            color: 'var(--ink)',
            backgroundColor: 'var(--surface-2)',
          }}
        >
          {result.feedback}
        </p>
      )}
    </section>
  );
}

function Waiting({
  testId,
  mood,
  message,
}: {
  testId: string;
  mood: 'lost' | 'skeptical';
  message: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col items-center gap-3 text-center py-6">
      <Mascot mood={mood} size={56} />
      <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>{message}</p>
    </div>
  );
}

/** A question that came back already marked, in the shape the screen uses for
 *  one it just marked. Resuming and answering are then the same state. */
function toResult(question: ExamQuestion): PracticeAnswerResult {
  return {
    question_id: question.question_id,
    answer: question.answer,
    verdict: question.verdict,
    correct_answer: question.correct_answer,
    feedback: question.feedback,
  };
}

function SittingShell({ mode, children }: { mode: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main
        data-testid={`${mode}-screen`}
        className="flex-1 flex flex-col gap-4 w-full max-w-2xl mx-auto px-5 py-6 sm:px-8 sm:py-10"
      >
        {children}
      </main>
    </div>
  );
}
