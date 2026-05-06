import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

async function verifyAdmin(): Promise<boolean> {
  try {
    const serverClient = await createSupabaseServerClient();
    const { data: { user } } = await serverClient.auth.getUser();
    if (!user) return false;
    const { data: profile } = await serverClient
      .from('profiles')
      .select('rol')
      .eq('id', user.id)
      .single();
    return profile?.rol === 'superadmin' || profile?.rol === 'admin';
  } catch {
    return false;
  }
}

// GET /api/admin/backup — descarga backup completo (auditorias + informes)
export async function GET() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  }

  try {
    const db = createSupabaseAdminClient();
    const [{ data: auditorias, error: e1 }, { data: informes, error: e2 }] = await Promise.all([
      db.from('auditorias').select('*').order('created_at', { ascending: true }),
      db.from('informes').select('*').order('numero', { ascending: true }),
    ]);

    if (e1) throw e1;
    if (e2) throw e2;

    // Limpiar pgpData de auditorias antiguas para reducir tamaño del backup
    const auditoriasSanitizadas = (auditorias || []).map(r => {
      const datos = r.datos as any;
      if (datos && datos.pgpData) {
        const { pgpData: _, ...datosSinPgp } = datos;
        return { ...r, datos: datosSinPgp };
      }
      return r;
    });

    const backup = {
      version: '1.1',
      fecha: new Date().toISOString(),
      organizacion: 'Dusakawi EPS',
      auditorias: auditoriasSanitizadas,
      informes: informes || [],
    };

    const json = JSON.stringify(backup, null, 2);
    const fecha = new Date().toISOString().slice(0, 10);

    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="backup_dsk_${fecha}.json"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// POST /api/admin/backup — restaura desde un backup JSON
export async function POST(request: Request) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  }

  try {
    const backup = await request.json();

    if (!backup.version || (!backup.auditorias && !backup.informes)) {
      return NextResponse.json({ message: 'Archivo de backup inválido.' }, { status: 400 });
    }

    const db = createSupabaseAdminClient();
    const resultados = { auditorias: 0, informes: 0, errores: [] as string[] };

    // Restaurar auditorias en lotes de 20
    const auditorias: any[] = backup.auditorias || [];
    for (let i = 0; i < auditorias.length; i += 20) {
      const lote = auditorias.slice(i, i + 20).map((r: any) => {
        // Limpiar pgpData si existe (campo obsoleto)
        const datos = r.datos as any;
        if (datos && datos.pgpData) {
          const { pgpData: _, ...datosSinPgp } = datos;
          return { ...r, datos: datosSinPgp };
        }
        return r;
      });
      const { error } = await db.from('auditorias').upsert(lote, { onConflict: 'id' });
      if (error) {
        resultados.errores.push(`Lote auditorias ${i}-${i + 20}: ${error.message}`);
      } else {
        resultados.auditorias += lote.length;
      }
    }

    // Restaurar informes en lotes de 20
    const informes: any[] = backup.informes || [];
    for (let i = 0; i < informes.length; i += 20) {
      const lote = informes.slice(i, i + 20);
      const { error } = await db.from('informes').upsert(lote, { onConflict: 'numero' });
      if (error) {
        resultados.errores.push(`Lote informes ${i}-${i + 20}: ${error.message}`);
      } else {
        resultados.informes += lote.length;
      }
    }

    return NextResponse.json({
      success: resultados.errores.length === 0,
      ...resultados,
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
