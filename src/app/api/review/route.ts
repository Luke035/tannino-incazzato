import { NextRequest, NextResponse } from 'next/server';
import { generateReview } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const { history, language } = await req.json();
  const review = await generateReview(history, language);
  return NextResponse.json({ review });
}
