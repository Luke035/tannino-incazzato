import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenerativeAI(apiKey);
}

export async function generateHint(
  denominationName: string,
  denominationType: string,
  wrongRegion: string,
  correctRegions: string[],
  remainingRegions: string[],
  attemptNumber: number,
  language: string
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const isMultiRegion = correctRegions.length > 1;
  const multiRegionNote = isMultiRegion
    ? `This denomination spans ${correctRegions.length} regions in total. The student has already found ${correctRegions.length - remainingRegions.length} of them and still needs to find ${remainingRegions.length} more.`
    : '';

  const prompt = `You are an encouraging sommelier tutor. A student is learning Italian wine denominations.
The student placed "${denominationName} ${denominationType}" in ${wrongRegion} (wrong attempt ${attemptNumber}).
${multiRegionNote}
The correct region(s) are: ${correctRegions.join(', ')}. The remaining unfound region(s) are: ${remainingRegions.join(', ')}.
Give a short hint (1-2 sentences) in ${language === 'it' ? 'Italian' : 'English'} that helps them figure out the right region(s) WITHOUT directly naming any region.
Use geographic, cultural, or historical clues. Be encouraging.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function generateReview(
  history: Array<{
    name: string;
    type: string;
    correctRegions: string[];
    wrongAttempts: number;
    result: string;
  }>,
  language: string
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const summary = history
    .map((h) => {
      const regionStr = h.correctRegions.join(', ');
      return h.result === 'auto-placed'
        ? `${h.name} ${h.type} (${regionStr}): not guessed (auto-placed)`
        : `${h.name} ${h.type} (${regionStr}): found with ${h.wrongAttempts} wrong attempt(s)`;
    })
    .join('\n');

  const prompt = `You are a sommelier tutor reviewing a student's practice session on Italian wine denominations.
Here are the results:
${summary}

Write a personalized review in ${language === 'it' ? 'Italian' : 'English'} (3-5 sentences) that:
- Identifies patterns in errors (e.g. confused northern regions, weak on Sicilian denominations)
- Highlights what went well
- Gives 1-2 concrete study suggestions`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
