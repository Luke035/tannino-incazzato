'use client';
import { useTranslations } from 'next-intl';
import { ExamQuestion } from '@/types';

// The two answers a true/false question accepts, in the bank's own vocabulary.
// The player answers in those terms and only the label is localized, so a paper
// sat in English is graded exactly like one sat in Italian.
const TRUE_FALSE_LABELS: Record<string, 'true' | 'false'> = {
  VERO: 'true',
  FALSO: 'false',
};

export function optionLabel(question: ExamQuestion, option: string, t: (key: string) => string) {
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
