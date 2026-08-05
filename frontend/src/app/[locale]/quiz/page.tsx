'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { startExam } from '@/lib/api';
import { EXAM_LENGTH, PASS_MARK_PCT } from '@/lib/exam';

// Mobile-first by design: every control below is reachable with one thumb.
export default function QuizPage() {
  const t = useTranslations();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState(false);

  const start = async () => {
    setStarting(true);
    setRefused(false);
    const exam = await startExam();
    if (!exam) {
      setStarting(false);
      setRefused(true);
      return;
    }
    router.push(`/quiz/exam/${exam.id}`);
  };

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
              {t('quiz.start.closedOnly')}
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

        {refused && (
          <div
            data-testid="quiz-empty"
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
              {t('quiz.emptyTitle')}
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
              {t('quiz.emptySubtitle')}
            </p>
          </div>
        )}

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
      </main>
    </div>
  );
}
