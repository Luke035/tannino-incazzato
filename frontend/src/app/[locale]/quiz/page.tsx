'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { fetchQuizQuestion } from '@/lib/api';
import { QuizQuestion } from '@/types';

// Mobile-first by design: every control below is reachable with one thumb.
// This is the tracer bullet — a question is drawn and shown, nothing is graded.
export default function QuizPage() {
  const t = useTranslations();
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');

  const draw = useCallback(async () => {
    setLoading(true);
    setAnswer('');
    setQuestion(await fetchQuizQuestion());
    setLoading(false);
  }, []);

  // Guarded like the recap page: React StrictMode invokes mount effects twice
  // in development, which would otherwise burn a question on every visit.
  const drawnRef = useRef(false);
  useEffect(() => {
    if (drawnRef.current) return;
    drawnRef.current = true;
    void draw();
  }, [draw]);

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
            {t('home.games.quiz.title')}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.92rem',
              color: 'var(--muted)',
            }}
          >
            {t('quiz.description')}
          </p>
        </div>

        {loading && (
          <p
            data-testid="quiz-loading"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}
          >
            {t('quiz.loading')}
          </p>
        )}

        {!loading && !question && (
          <div
            data-testid="quiz-empty"
            className="flex flex-col items-center gap-4 text-center py-10"
          >
            <Mascot mood="lost" size={72} />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                color: 'var(--ink)',
              }}
            >
              {t('quiz.emptyTitle')}
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
              {t('quiz.emptySubtitle')}
            </p>
          </div>
        )}

        {!loading && question && (
          <>
            <article
              data-testid="quiz-question"
              className="flex flex-col gap-5 rounded-3xl p-5 sm:p-7"
              style={{
                backgroundColor: 'var(--surface)',
                border: '2px solid var(--border)',
              }}
            >
              <div className="flex flex-wrap gap-2">
                <span
                  data-testid="quiz-level"
                  className="px-3 py-1 rounded-full text-white font-bold"
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
                  data-testid="quiz-format"
                  className="px-3 py-1 rounded-full font-bold"
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
                data-testid="quiz-question-text"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.15rem, 4.5vw, 1.5rem)',
                  lineHeight: '1.3',
                  color: 'var(--ink)',
                }}
              >
                {question.text}
              </h2>

              <QuestionInput question={question} answer={answer} onAnswer={setAnswer} />
            </article>

            <p
              className="text-center"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.82rem',
                color: 'var(--muted)',
              }}
            >
              {t('quiz.notGradedYet')}
            </p>

            <button
              data-testid="quiz-another"
              onClick={draw}
              className="w-full px-8 py-4 font-bold rounded-full text-white transition-opacity hover:opacity-90"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '1rem',
                backgroundColor: 'var(--accent)',
              }}
            >
              {t('quiz.another')}
            </button>
          </>
        )}
      </main>
    </div>
  );
}

// Answers are collected but not sent anywhere yet — grading lands with the
// Session work. The shapes are here so the mobile ergonomics are real.
function QuestionInput({
  question,
  answer,
  onAnswer,
}: {
  question: QuizQuestion;
  answer: string;
  onAnswer: (value: string) => void;
}) {
  const t = useTranslations();

  if (question.format === 'open') {
    return (
      <textarea
        data-testid="quiz-open-answer"
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        placeholder={t('quiz.openPlaceholder')}
        rows={5}
        className="w-full rounded-2xl p-4 resize-y"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '1rem',
          backgroundColor: 'var(--bg)',
          color: 'var(--ink)',
          border: '2px solid var(--border)',
        }}
      />
    );
  }

  // True/false is two short labels — a proper pill pair, side by side.
  // Multiple-choice options are prose that wraps, so they take the large card
  // radius instead: a 999px radius on three wrapped lines eats the width.
  const isTrueFalse = question.format === 'true_false';
  const choices = isTrueFalse ? [t('quiz.true'), t('quiz.false')] : question.options;

  return (
    <div className={isTrueFalse ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
      {choices.map((choice) => {
        const selected = answer === choice;
        return (
          <button
            key={choice}
            data-testid="quiz-option"
            aria-pressed={selected}
            onClick={() => onAnswer(choice)}
            // generous tap target — this game is played standing on a bus
            className={`w-full px-5 py-4 font-semibold transition-colors ${
              isTrueFalse ? 'text-center' : 'text-left'
            }`}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.95rem',
              minHeight: '3.25rem',
              borderRadius: isTrueFalse ? '999px' : '1.5rem',
              backgroundColor: selected ? 'var(--accent)' : 'var(--surface-2)',
              color: selected ? 'white' : 'var(--ink)',
              border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {choice}
          </button>
        );
      })}
    </div>
  );
}
