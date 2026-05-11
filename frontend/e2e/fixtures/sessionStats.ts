export const EMPTY_STATS = {
  sessions: [],
  aggregate: {
    total_sessions: 0,
    avg_score_pct: 0,
    best_score_pct: 0,
    best_session: null,
    unique_denoms: 0,
    total_denoms: 410,
  },
  type_performance: { doc_pct: null, docg_pct: null },
  top_regions: [],
  low_regions: [],
};

export const ONE_SESSION_STATS = {
  sessions: [
    {
      id: 1,
      filter: 'both',
      score_pct: 87,
      items: 10,
      duration_seconds: 720,
      played_at: '2026-05-11T10:00:00Z',
    },
  ],
  aggregate: {
    total_sessions: 1,
    avg_score_pct: 87,
    best_score_pct: 87,
    best_session: { played_at: '2026-05-11T10:00:00Z', filter: 'both' },
    unique_denoms: 10,
    total_denoms: 410,
  },
  type_performance: { doc_pct: 80, docg_pct: 93 },
  top_regions: [
    { region: 'piedmont', score_pct: 100 },
    { region: 'tuscany',  score_pct: 90  },
  ],
  low_regions: [
    { region: 'sardinia', score_pct: 50 },
  ],
};
