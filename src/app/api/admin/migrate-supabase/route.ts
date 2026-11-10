import { NextResponse } from 'next/server';

// Supabase deshabilitado — la app usa exclusivamente Google Drive.
export async function GET() {
  return NextResponse.json(
    { error: 'Supabase deshabilitado. La base de datos es Google Drive.' },
    { status: 410 }
  );
}
export async function POST() {
  return NextResponse.json(
    { error: 'Supabase deshabilitado. La base de datos es Google Drive.' },
    { status: 410 }
  );
}
