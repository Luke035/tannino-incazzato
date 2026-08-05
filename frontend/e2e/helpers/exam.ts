import type { Page } from '@playwright/test';
import { CORRECT_OPTION, EXAM_ID, EXAM_LENGTH } from '../fixtures/exam';

// Sitting the paper the way a player does: everything is read off the screen,
// nothing is looked up in the state behind it. Shared by every spec that has
// to get a student partway through an Exam.

/** The question on screen, identified from what it says. The fixtures number
 *  their text in the order they are served, and their ids run alongside. */
export async function currentQuestionId(page: Page): Promise<number> {
  const text = await page.getByTestId('exam-question-text').innerText();
  const position = Number(text.replace(/\D+/g, '')) - 1;
  return 100 + position;
}

/** Answer the question on screen. `right` decides whether the student knows
 *  their material; the option to tap — or the answer to type — is read off the
 *  screen, exactly as a player reads it. Returns what was answered. */
export async function answerCurrent(page: Page, right: boolean): Promise<string> {
  const questionId = await currentQuestionId(page);
  const correct = CORRECT_OPTION[questionId];

  const written = page.getByTestId('exam-open-answer');
  if (await written.count()) {
    const value = right ? correct : 'boh, il tannino, direi';
    await written.fill(value);
    return value;
  }

  const options = page.getByTestId('exam-option');
  const count = await options.count();

  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    const value = await option.getAttribute('data-option');
    if (right === (value === correct)) {
      await option.tap();
      return value ?? '';
    }
  }
  throw new Error(`no ${right ? 'correct' : 'wrong'} option on screen`);
}

/** Walk the whole paper, answering `correct` of the questions right. */
export async function sitExam(page: Page, correct: number): Promise<void> {
  for (let position = 0; position < EXAM_LENGTH; position += 1) {
    await answerCurrent(page, position < correct);
    await page.getByTestId('exam-next').tap();
  }
}

/** From the landing screen to the first question of a fresh paper. */
export async function startExam(page: Page): Promise<void> {
  await page.goto('/en/quiz');
  await page.getByTestId('exam-start').tap();
  await page.waitForURL(`**/quiz/exam/${EXAM_ID}`);
  await page.getByTestId('exam-question').waitFor();
}
