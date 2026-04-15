import { NextRequest, NextResponse } from 'next/server';
import { generateHint } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const { denominationName, denominationType, wrongRegion, correctRegions, remainingRegions, attemptNumber, language } =
    await req.json();
  const hint = await generateHint(
    denominationName,
    denominationType,
    wrongRegion,
    correctRegions,
    remainingRegions,
    attemptNumber,
    language
  );
  return NextResponse.json({ hint });
}
