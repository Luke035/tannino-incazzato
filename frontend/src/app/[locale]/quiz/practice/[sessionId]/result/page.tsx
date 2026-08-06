'use client';
import { use } from 'react';
import { FeedbackResult } from '@/components/quiz/FeedbackResult';
import { fetchPracticeSession } from '@/lib/api';

/** How the Practice Session went. The screen is shared with Error Review; what
 *  is Practice's own is the Level badge, which renders because a Practice
 *  Session has a Level and an Error Review Session deliberately does not. */
export default function PracticeResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  return (
    <FeedbackResult
      sessionId={Number(sessionId)}
      mode="practice"
      copy="quiz.practice"
      load={fetchPracticeSession}
      againHref="/quiz/practice"
    />
  );
}
