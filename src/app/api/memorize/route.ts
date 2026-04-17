import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

export async function POST(req: NextRequest) {
  const { denominationName, denominationType, correctRegions, language } = await req.json();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ tip: '' }, { status: 500 });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const regionStr = correctRegions.join(', ');
  const lang = language === 'it' ? 'Italian' : 'English';

  const prompt = `You are a sommelier tutor helping a student memorize Italian wine denominations.
The student failed to place "${denominationName} ${denominationType}" — the correct region(s) are: ${regionStr}.
Write a short, memorable tip (2-3 sentences) in ${lang} that helps them remember this association.
Use a vivid geographic, historical, cultural, or sensory clue — something that sticks. Be warm and encouraging.`;

  const result = await model.generateContent(prompt);
  return NextResponse.json({ tip: result.response.text() });
}
