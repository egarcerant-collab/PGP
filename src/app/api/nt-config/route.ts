import { NextResponse } from 'next/server';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';

export type NtConfigEntry = {
  id: string;
  nit: string;
  prestador: string;
  contrato?: string;
  mesInicio: string;
  mesFin: string;
  nt: number;
  vigencia: number;
  nota?: string;
};

const FILE = 'nt_config.json';

async function load(): Promise<NtConfigEntry[]> {
  return (await readJson<NtConfigEntry[]>(getDrive(), ROOT_FOLDER_ID, FILE)) ?? [];
}

export async function GET() {
  try {
    const configs = await load();
    return NextResponse.json({ configs });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const drive = getDrive();
    const configs = await load();

    const entry: NtConfigEntry = {
      id: body.id || crypto.randomUUID(),
      nit: String(body.nit || '').trim(),
      prestador: String(body.prestador || '').trim(),
      contrato: String(body.contrato || '').trim(),
      mesInicio: String(body.mesInicio || '').toUpperCase().trim(),
      mesFin: String(body.mesFin || '').toUpperCase().trim(),
      nt: Number(body.nt) || 0,
      vigencia: Number(body.vigencia) || new Date().getFullYear(),
      nota: String(body.nota || '').trim(),
    };

    if (!entry.nit || !entry.mesInicio || !entry.mesFin || entry.nt <= 0) {
      return NextResponse.json({ message: 'Faltan campos requeridos (nit, mesInicio, mesFin, nt)' }, { status: 400 });
    }

    const idx = configs.findIndex(c => c.id === entry.id);
    if (idx !== -1) configs[idx] = entry;
    else configs.push(entry);

    await writeJson(drive, ROOT_FOLDER_ID, FILE, configs);
    return NextResponse.json({ success: true, config: entry });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'Falta id' }, { status: 400 });

    const drive = getDrive();
    const configs = (await load()).filter(c => c.id !== id);
    await writeJson(drive, ROOT_FOLDER_ID, FILE, configs);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
