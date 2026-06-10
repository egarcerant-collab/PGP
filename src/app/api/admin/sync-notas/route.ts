import { NextResponse } from 'next/server';

// Esta ruta era una migración one-time de Supabase → Drive.
// Ya no es necesaria: la app usa exclusivamente Google Drive.
export async function POST() {
  return NextResponse.json({
    ok: false,
    message: 'Esta ruta de migración ya no aplica. La app usa exclusivamente Google Drive.',
  }, { status: 410 });
}
