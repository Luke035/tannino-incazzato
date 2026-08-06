'use client';
import { use } from 'react';
import { useTranslations } from 'next-intl';
import { FeedbackResult } from '@/components/quiz/FeedbackResult';
import { fetchErrorReview } from '@/lib/api';
import { ReviewSession } from '@/types';

/** How the Error Review Session went, and — the part that matters here — how
 *  much is left. This is the first count that includes the work just done:
 *  mastery is earned by *submitted* Sessions, so finishing is what moves it. */
export default function ReviewResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  return (
    <FeedbackResult<ReviewSession>
      sessionId={Number(sessionId)}
      mode="review"
      copy="quiz.review"
      load={fetchErrorReview}
      againHref="/quiz/review"
      aside={(session) => <Remaining pending={session.pending} />}
    />
  );
}

/** Emptying the pool is winning, and it is the only place in the product where
 *  a student can be told they have finished something. Said plainly when they
 *  have, and as a count when they have not. */
function Remaining({ pending }: { pending: number }) {
  const t = useTranslations();

  return (
    <p
      data-testid="review-remaining"
      className="card-rounded px-4 py-3"
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.9rem',
        color: 'var(--ink)',
        backgroundColor: 'var(--surface-2)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {t('quiz.review.result.remaining', { count: pending })}
    </p>
  );
}
