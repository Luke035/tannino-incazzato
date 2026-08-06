'use client';
import { use } from 'react';
import { FeedbackSitting } from '@/components/quiz/FeedbackSitting';
import { fetchPracticeSession, finishPractice, savePracticeAnswer } from '@/lib/api';

/** A Practice Session. The screen is shared with Error Review — both mark as
 *  they go, and the correction landing immediately is the whole reason either
 *  mode exists. What is Practice's own is where the questions came from, and
 *  that was settled by the backend before this page loaded. */
export default function PracticeSittingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  return (
    <FeedbackSitting
      sessionId={Number(sessionId)}
      mode="practice"
      copy="quiz.practice"
      load={fetchPracticeSession}
      save={savePracticeAnswer}
      finish={finishPractice}
      setupHref="/quiz/practice"
    />
  );
}
