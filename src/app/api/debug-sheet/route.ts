import { NextResponse } from 'next/server';
import { getDrive, readJson, syncInformesToSheet, ROOT_FOLDER_ID, INFORMES_SHEET_ID } from '@/lib/gdrive';

export async function GET() {
  try {
    const drive = getDrive();
    const informes = (await readJson<any[]>(drive, ROOT_FOLDER_ID, 'informes.json')) ?? [];
    await syncInformesToSheet(informes);
    return NextResponse.json({ success: true, total: informes.length, sheetId: INFORMES_SHEET_ID });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.substring(0, 500) }, { status: 500 });
  }
}
