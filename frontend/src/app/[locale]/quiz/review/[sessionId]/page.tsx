'use client';
import { use } from 'react';
import { useTranslations } from 'next-intl';
import { FeedbackSitting } from '@/components/quiz/FeedbackSitting';
import { fetchErrorReview, finishErrorReview, saveErrorReviewAnswer } from '@/lib/api';
import { ReviewSession } from '@/types';

/** An Error Review Session. Same screen as Practice — the correction lands with
 *  the answer in both — with one thing added: how many questions are still
 *  waiting to be Mastered.
 *
 *  That number is the mode. Practice is something a student does forever; this
 *  is something they are trying to finish, and a screen that never showed them
 *  the end getting closer would be hiding the only reward on offer. */
export default function ReviewSittingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  return (
    <FeedbackSitting<ReviewSession>
      sessionId={Number(sessionId)}
      mode="review"
      copy="quiz.review"
      load={fetchErrorReview}
      save={saveErrorReviewAnswer}
      finish={finishErrorReview}
      setupHref="/quiz/review"
      aside={(session) => <Pending pending={session.pending} />}
    />
  );
}

/** Deliberately quiet, and deliberately not a second progress bar: the bar
 *  above it is about this Session, and this is about the pile the Session came
 *  out of. It only moves when the Session is finished — mastery is counted in
 *  submitted Sessions — so an animated counter here would be a lie. */
function Pending({ pending }: { pending: number }) {
  const t = useTranslations();

  return (
    <p
      data-testid="review-pending"
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '0.82rem',
        color: 'var(--faint)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {t('quiz.review.pending', { count: pending })}
    </p>
  );
}
