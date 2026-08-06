'use client';
import { useTranslations } from 'next-intl';
import { optionLabel } from '@/components/quiz/QuestionCard';
import { ExamQuestion } from '@/types';

/** Question by question, at the end of a Session. Shared by the Exam recap and
 *  the Practice recap, because "what did I get wrong and what was the answer"
 *  is the same question in both.
 *
 *  A Closed Question that went wrong shows the correct answer and nothing else;
 *  a written one also shows what the agent found missing. One still without a
 *  Verdict shows neither — it carries no marking yet, and the answer is not
 *  given away before it does. */
export function Breakdown({ questions }: { questions: ExamQuestion[] }) {
  const t = useTranslations();

  return (
    <>
      <h2
        className="pt-2"
        style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--ink)' }}
      >
        {t('quiz.result.breakdown')}
      </h2>

      <ol className="flex flex-col gap-3">
        {questions.map((question, position) => (
          <BreakdownRow key={question.question_id} question={question} position={position} />
        ))}
      </ol>
    </>
  );
}

function BreakdownRow({ question, position }: { question: ExamQuestion; position: number }) {
  const t = useTranslations();

  const pending = question.verdict === null;
  const correct = question.verdict === 'correct';
  const edge = pending ? 'var(--border)' : correct ? 'var(--correct)' : 'var(--rust)';

  return (
    <li
      data-testid={
        pending ? 'exam-answer-grading' : correct ? 'exam-answer-correct' : 'exam-answer-wrong'
      }
      className="flex flex-col gap-2 card-rounded p-4"
      style={{ backgroundColor: 'var(--surface)', border: `2px solid ${edge}` }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.1em',
          color: pending ? 'var(--muted)' : edge,
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
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--muted)' }}>
        {t('quiz.result.yourAnswer')}:{' '}
        <strong style={{ color: pending ? 'var(--ink)' : edge }}>
          {question.answer
            ? optionLabel(question, question.answer, t)
            : t('quiz.result.noAnswer')}
        </strong>
      </p>

      {pending && (
        <p
          data-testid="exam-answer-grading-note"
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--faint)' }}
        >
          {t('quiz.result.beingGraded')}
        </p>
      )}

      {/* A wrong answer leaves the recap knowing more than it arrived with. */}
      {!pending && !correct && question.correct_answer && (
        <p
          data-testid="exam-correct-answer"
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: 'var(--ink)' }}
        >
          {t('quiz.result.correctAnswer')}:{' '}
          <strong>{optionLabel(question, question.correct_answer, t)}</strong>
        </p>
      )}

      {/* Only a written answer gets one, and only from the grading agent. */}
      {!pending && question.feedback && (
        <p
          data-testid="exam-answer-feedback"
          className="card-rounded p-3"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.85rem',
            lineHeight: '1.45',
            color: 'var(--ink)',
            backgroundColor: 'var(--surface-2)',
          }}
        >
          {question.feedback}
        </p>
      )}
    </li>
  );
}
