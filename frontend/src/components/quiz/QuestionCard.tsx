'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { MAX_OPEN_ANSWER_CHARS } from '@/lib/exam';
import { ExamQuestion } from '@/types';

// The two answers a true/false question accepts, in the bank's own vocabulary.
// The player answers in those terms and only the label is localized, so a paper
// sat in English is graded exactly like one sat in Italian.
const TRUE_FALSE_LABELS: Record<string, 'true' | 'false'> = {
  VERO: 'true',
  FALSO: 'false',
};

export function optionLabel(question: ExamQuestion, option: string, t: (key: string) => string) {
  // Only a Closed Question speaks that vocabulary. A student who happens to
  // write "VERO" in a written answer wrote a word, not an option.
  if (question.format === 'open') return option;
  const label = TRUE_FALSE_LABELS[option];
  return label ? t(`quiz.${label}`) : option;
}

/** One question on its own screen. Every control sits within a thumb's reach:
 *  this game is played standing on a bus. */
export function QuestionCard({
  question,
  answer,
  onAnswer,
}: {
  question: ExamQuestion;
  answer: string | null;
  onAnswer: (value: string) => void;
}) {
  const t = useTranslations();

  // True/false is two short labels — a proper pill pair, side by side.
  // Multiple-choice options are prose that wraps, so they take the large card
  // radius instead: 999px on three wrapped lines eats the width.
  const isTrueFalse = question.format === 'true_false';
  const isOpen = question.format === 'open';

  return (
    <article
      data-testid="exam-question"
      className="flex flex-col gap-5 card-rounded p-5 sm:p-7"
      style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
    >
      <div className="flex flex-wrap gap-2">
        <span
          data-testid="exam-question-level"
          className="px-3 py-1 pill text-white font-bold"
          style={{
            backgroundColor: 'var(--primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.66rem',
            letterSpacing: '0.08em',
          }}
        >
          {t('quiz.level', { level: question.level })}
        </span>
        <span
          data-testid="exam-question-format"
          className="px-3 py-1 pill font-bold"
          style={{
            backgroundColor: 'var(--surface-2)',
            color: 'var(--ink)',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.66rem',
            letterSpacing: '0.08em',
          }}
        >
          {t(`quiz.formats.${question.format}`)}
        </span>
      </div>

      <h2
        data-testid="exam-question-text"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.15rem, 4.5vw, 1.5rem)',
          lineHeight: '1.3',
          color: 'var(--ink)',
        }}
      >
        {question.text}
      </h2>

      {isOpen && <OpenAnswerField answer={answer} onAnswer={onAnswer} />}

      <div className={isTrueFalse ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        {question.options.map((option) => {
          const selected = answer === option;
          return (
            <button
              key={option}
              data-testid="exam-option"
              data-option={option}
              aria-pressed={selected}
              onClick={() => onAnswer(option)}
              // generous tap target — one thumb, no aiming
              className={`w-full px-5 py-4 font-semibold transition-colors ${
                isTrueFalse ? 'pill text-center' : 'card-rounded text-left'
              }`}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.95rem',
                minHeight: '3.25rem',
                backgroundColor: selected ? 'var(--accent)' : 'var(--surface-2)',
                color: selected ? 'white' : 'var(--ink)',
                border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {optionLabel(question, option, t)}
            </button>
          );
        })}
      </div>
    </article>
  );
}

/** The written answer. Two things make or break this box on a phone: it has to
 *  show what you already wrote, and the soft keyboard must not sit on top of
 *  it. Hence a field that grows with the answer rather than scrolling inside
 *  three lines, and a scroll that puts it back in view when the keyboard
 *  takes half the screen. */
function OpenAnswerField({
  answer,
  onAnswer,
}: {
  answer: string | null;
  onAnswer: (value: string) => void;
}) {
  const t = useTranslations();
  const field = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const box = field.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, []);

  useEffect(() => {
    fit();
  }, [fit, answer]);

  // The keyboard animates in, and on iOS the viewport only settles once it
  // has: scrolling straight away scrolls to where the field used to be.
  const keepInView = useCallback(() => {
    window.setTimeout(() => {
      field.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 300);
  }, []);

  // A late or second resize — rotating the phone, switching to the emoji
  // keyboard — moves the field back under the keyboard. Follow it.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const follow = () => {
      if (document.activeElement === field.current) keepInView();
    };
    viewport.addEventListener('resize', follow);
    return () => viewport.removeEventListener('resize', follow);
  }, [keepInView]);

  const written = answer?.length ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={field}
        data-testid="exam-open-answer"
        value={answer ?? ''}
        onChange={(event) => onAnswer(event.target.value.slice(0, MAX_OPEN_ANSWER_CHARS))}
        onFocus={keepInView}
        rows={4}
        maxLength={MAX_OPEN_ANSWER_CHARS}
        placeholder={t('quiz.exam.openPlaceholder')}
        // Autocorrect off: this is a wine vocabulary the phone has never heard
        // of, and it will "fix" every word of it — into a wrong answer.
        autoCapitalize="sentences"
        autoCorrect="off"
        spellCheck={false}
        className="w-full px-5 py-4 card-rounded resize-none"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '1rem', // never below 16px: anything less makes iOS zoom in
          lineHeight: '1.5',
          minHeight: '7.5rem',
          backgroundColor: 'var(--surface-2)',
          color: 'var(--ink)',
          border: '2px solid var(--border)',
        }}
      />
      {/* Silent until the cap is actually in sight — a counter on an empty box
          is a word limit nobody asked for. */}
      {written > MAX_OPEN_ANSWER_CHARS * 0.8 && (
        <p
          data-testid="exam-open-remaining"
          className="self-end"
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--faint)' }}
        >
          {t('quiz.exam.charactersLeft', { count: MAX_OPEN_ANSWER_CHARS - written })}
        </p>
      )}
    </div>
  );
}
