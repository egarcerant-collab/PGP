
import { NextResponse } from 'next/server';

export async function GET() {
  const isAiEnabled = !!process.env.GOOGLE_GENAI_API_KEY;
  return NextResponse.json({ isAiEnabled });
}
