import { NextResponse } from 'next/server';
import { getDrive, readJson, ROOT_FOLDER_ID } from '@/lib/gdrive';
import type { NtConfigEntry } from '@/lib/nt-config';
import { getNtForMonth } from '@/lib/nt-config';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const nit = url.searchParams.get('nit') || '';
    const mes = url.searchParams.get('mes') || 'ABRIL';
    const vigencia = Number(url.searchParams.get('vigencia') || new Date().getFullYear());

    const configs = (await readJson<NtConfigEntry[]>(getDrive(), ROOT_FOLDER_ID, 'nt_config.json')) ?? [];

    const nitClean = nit.replace(/\D/g, '');
    const result = getNtForMonth(configs, nit, mes, vigencia, 0);

    return NextResponse.json({
      totalConfigs: configs.length,
      configs,
      query: { nit, nitClean, mes, vigencia },
      resultadoNT: result,
      rootFolderId: ROOT_FOLDER_ID,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
