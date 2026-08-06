'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import Header from '@/components/Header';
import { Mascot } from '@/components/Mascot';
import { fetchCurrentExam, PracticeRefusal, startPractice } from '@/lib/api';
import {
  DEFAULT_PRACTICE_LENGTH,
  DEFAULT_PRACTICE_LEVEL,
  PracticeLength,
  PRACTICE_LENGTHS,
  PRACTICE_LEVELS,
  PRACTICE_OPEN_COUNT,
} from '@/lib/practice';
import { QuestionLevel } from '@/types';

/** Two choices and a button: the Level you have lessons on, and how long you
 *  have. Mobile-first like the rest of the game — both rows are thumb-sized
 *  segmented controls, not dropdowns. */
export default function PracticeSetupPage() {
  const t = useTranslations();
  const router = useRouter();

  const [level, setLevel] = useState<QuestionLevel>(DEFAULT_PRACTICE_LEVEL);
  const [length, setLength] = useState<PracticeLength>(DEFAULT_PRACTICE_LENGTH);
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<PracticeRefusal | null>(null);

  // A Session already open holds the one slot across every mode, so there is
  // nothing to start here — the landing screen is where it is resumed or
  // binned, and that is where the student goes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const open = await fetchCurrentExam();
      if (!cancelled && open) router.replace('/quiz');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const start = async () => {
    setStarting(true);
    setRefused(null);
    const result = await startPractice(level, length);

    if ('started' in result) {
      router.push(`/quiz/practice/${result.started.id}`);
      return;
    }
    setStarting(false);
    if (result.refused === 'in_progress') {
      router.push('/quiz');
      return;
    }
    setRefused(result.refused);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      <Header />
      <main
        data-testid="practice-setup"
        className="flex-1 flex flex-col gap-6 w-full max-w-2xl mx-auto px-5 py-8 sm:px-8 sm:py-12"
      >
        <Link
          href="/quiz"
          className="font-bold self-start"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          {t('quiz.practice.result.backToQuiz')}
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
            {t('quiz.practice.eyebrow')}
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
            {t('quiz.practice.title')}
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.92rem', color: 'var(--muted)' }}>
            {t('quiz.practice.subtitle')}
          </p>
        </div>

        <Choice
          testId="practice-level"
          label={t('quiz.practice.levelLabel')}
          options={PRACTICE_LEVELS.map((value) => ({
            value,
            label: t('quiz.level', { level: value }),
          }))}
          selected={level}
          onSelect={setLevel}
        />

        <Choice
          testId="practice-length"
          label={t('quiz.practice.lengthLabel')}
          options={PRACTICE_LENGTHS.map((value) => ({
            value,
            label: t('quiz.practice.lengthOption', { count: value }),
          }))}
          selected={length}
          onSelect={setLength}
          note={t('quiz.practice.openNote', { count: PRACTICE_OPEN_COUNT[length] })}
        />

        <section
          className="flex flex-col gap-4 card-rounded p-5 sm:p-7"
          style={{ backgroundColor: 'var(--surface)', border: '2px solid var(--border)' }}
        >
          <div className="flex items-center gap-4">
            <Mascot mood="happy" size={56} />
            <ul className="flex flex-col gap-2">
              {[
                t('quiz.practice.rules.level'),
                t('quiz.practice.rules.feedback'),
                t('quiz.practice.rules.adaptive'),
                t('quiz.practice.rules.noVerdict'),
              ].map((rule) => (
                <li
                  key={rule}
                  className="flex gap-3"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '0.9rem',
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
          </div>
        </section>

        {/* A Level too thin to fill the session is a fact about the bank;
            anything else is the backend not answering, and the student is
            told which. */}
        {refused && (
          <div
            data-testid={refused === 'level_too_thin' ? 'practice-thin' : 'practice-unavailable'}
            className="flex flex-col items-center gap-3 text-center py-4"
          >
            <Mascot mood="lost" size={64} />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                color: 'var(--ink)',
              }}
            >
              {refused === 'level_too_thin'
                ? t('quiz.practice.thinTitle')
                : t('quiz.unavailableTitle')}
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
              {refused === 'level_too_thin'
                ? t('quiz.practice.thinSubtitle')
                : t('quiz.unavailableSubtitle')}
            </p>
          </div>
        )}

        <button
          data-testid="practice-start"
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
          {starting ? t('quiz.practice.starting') : t('quiz.practice.cta')}
        </button>
      </main>
    </div>
  );
}

/** A segmented control sized for a thumb. Three options across a phone is the
 *  widest this pattern goes, which is exactly what both rows need. */
function Choice<T extends number>({
  testId,
  label,
  options,
  selected,
  onSelect,
  note,
}: {
  testId: string;
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  note?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend
        className="font-bold mb-2"
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', color: 'var(--ink)' }}
      >
        {label}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              data-testid={testId}
              data-value={option.value}
              aria-pressed={active}
              onClick={() => onSelect(option.value)}
              className="pill font-bold transition-colors px-2 py-3"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.85rem',
                minHeight: '3rem',
                backgroundColor: active ? 'var(--accent)' : 'var(--surface-2)',
                color: active ? 'white' : 'var(--ink)',
                border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {note && (
        <p
          data-testid={`${testId}-note`}
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--faint)' }}
        >
          {note}
        </p>
      )}
    </fieldset>
  );
}
