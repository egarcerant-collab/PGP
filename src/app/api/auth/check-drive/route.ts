import { NextResponse } from 'next/server';
import { getDrive, ROOT_FOLDER_ID } from '@/lib/gdrive';

// Endpoint de diagnóstico — verificar conexión Drive desde Vercel
export async function GET() {
  const vars = {
    GOOGLE_SERVICE_ACCOUNT_JSON: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SERVICE_ACCOUNT_JSON !== 'PENDIENTE',
    GOOGLE_CLIENT_ID:            !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET:        !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REFRESH_TOKEN:  !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    GDRIVE_FOLDER_ID:            process.env.GDRIVE_FOLDER_ID || ROOT_FOLDER_ID,
    LOCAL_BYPASS:                process.env.NEXT_PUBLIC_LOCAL_BYPASS,
    JWT_SECRET:                  !!process.env.JWT_SECRET,
    NODE_ENV:                    process.env.NODE_ENV,
  };

  try {
    const drive = getDrive();
    // Intentar listar archivos en la carpeta raíz
    const res = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(name)',
      pageSize: 10,
    });
    const files = res.data.files?.map((f: any) => f.name) ?? [];
    return NextResponse.json({ ok: true, vars, files });
  } catch (e: any) {
    return NextResponse.json({ ok: false, vars, error: e.message }, { status: 500 });
  }
}
