export const EMPTY_QUIZ_STATS = {
  exams: [],
  aggregate: {
    total_exams: 0,
    exams_passed: 0,
    avg_score_pct: 0,
    best_score_pct: 0,
  },
  by_level: [],
  by_format: [],
  by_topic: [],
  pending_mastery: 0,
};

// One submitted Exam, plus the pattern the ticket names: solid on the Closed
// questions, collapsing on the written ones.
export const ONE_EXAM_QUIZ_STATS = {
  exams: [
    {
      id: 1,
      score_pct: 63.3,
      passed: true,
      duration_seconds: 1500,
      played_at: '2026-05-11T10:00:00Z',
    },
  ],
  aggregate: {
    total_exams: 1,
    exams_passed: 1,
    avg_score_pct: 63.3,
    best_score_pct: 63.3,
  },
  by_level: [
    { level: 1, correct_pct: 80, answered: 10 },
    { level: 2, correct_pct: 55, answered: 12 },
    { level: 3, correct_pct: 40, answered: 8 },
  ],
  by_format: [
    { format: 'closed', correct_pct: 88, answered: 16 },
    { format: 'open', correct_pct: 36, answered: 14 },
  ],
  by_topic: [
    { topic: 'sparkling_wines', correct_pct: 25, answered: 4 },
    { topic: 'tasting', correct_pct: 90, answered: 10 },
  ],
  pending_mastery: 12,
};
