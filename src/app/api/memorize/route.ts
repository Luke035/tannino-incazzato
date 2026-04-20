import { NextRequest, NextResponse } from 'next/server';
import { generateMemorizeTip } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const { denominationName, denominationType, correctRegions, language } = await req.json();
  const tip = await generateMemorizeTip(denominationName, denominationType, correctRegions, language);
  return NextResponse.json({ tip });
}
