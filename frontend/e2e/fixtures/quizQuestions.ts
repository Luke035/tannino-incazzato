// Questions served by the mocked `GET /quiz/question`. One of each format, so
// a spec can assert the three input shapes without depending on the real bank.
// Options arrive already shuffled, as the backend serves them.
export const QUIZ_MULTIPLE_CHOICE = {
  id: 1176,
  text: '[question text removed]',
  format: 'multiple_choice',
  level: 1,
  options: ['A quattro Magnum', 'A cinque litri', 'A tre litri'],
  topic: null,
};

export const QUIZ_TRUE_FALSE = {
  id: 454,
  text: '[question text removed]',
  format: 'true_false',
  level: 2,
  options: [],
  topic: null,
};

export const QUIZ_OPEN = {
  id: 1,
  text: 'Example question 1?',
  format: 'open',
  level: 2,
  options: [],
  topic: null,
};

export const QUIZ_QUESTIONS = [QUIZ_MULTIPLE_CHOICE, QUIZ_TRUE_FALSE, QUIZ_OPEN];
