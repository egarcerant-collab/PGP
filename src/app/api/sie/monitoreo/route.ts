/**
 * GET /api/sie/monitoreo  → estado actual de radicaciones por contrato
 * POST /api/sie/monitoreo { contrato? } → consultar SIE, extraer meses, guardar
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/get-current-user';
import { getSieClient } from '@/lib/sie-client';
import { CONTRATOS_PGP } from '@/lib/contratos-pgp';
import { getDrive, readJson, writeJson, getSubfolder, ROOT_FOLDER_ID } from '@/lib/gdrive';

const MONITOREO_FILE = 'sie_monitoreo.json';

export interface EstadoContrato {
  contrato: string;
  prestador: string;
  nit: string;
  ciudad: string;
  departamento: string;
  hayRips: boolean;
  totalRegistros: number;
  estados: string[];
  ultimaConsulta: string;
  ultimaRadicacion: string | null;
  // Cobertura mensual — derivada de los RIPS JSON descargados
  mesesCargados: string[];     // e.g. ['2026-01', '2026-02']
  mesesEsperados: string[];    // hasta el mes actual dentro del contrato
  archivosDescargados?: number;
}

// ─── Helpers de fechas ────────────────────────────────────────────────────────

/** Meses del contrato esperados hasta hoy */
function getMesesEsperados(fechaInicio: string, fechaFin: string): string[] {
  const meses: string[] = [];
  const start = new Date(fechaInicio + 'T00:00:00');
  const end = new Date(fechaFin + 'T00:00:00');
  const hoy = new Date();
  const limite = end < hoy ? end : hoy;
  const curr = new Date(start.getFullYear(), start.getMonth(), 1);
  while (curr <= limite) {
    meses.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`);
    curr.setMonth(curr.getMonth() + 1);
  }
  return meses;
}

/** Extrae los meses de prestación de servicio de un JSON RIPS (Res. 2275) */
function extractMesesFromRips(json: unknown): string[] {
  if (!json || typeof json !== 'object') return [];
  const data = json as { usuarios?: Array<{ servicios?: Record<string, Array<{ fechaInicioAtencion?: string; fechaInicio?: string }>> }> };
  const months = new Set<string>();
  for (const usuario of data.usuarios ?? []) {
    for (const lista of Object.values(usuario.servicios ?? {})) {
      for (const item of lista ?? []) {
        const fecha = item.fechaInicioAtencion ?? item.fechaInicio ?? '';
        const m = String(fecha).match(/^(\d{4})-(\d{2})/);
        if (m) months.add(`${m[1]}-${m[2]}`);
      }
    }
  }
  return [...months].sort();
}

// ─── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegram(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ADMINCHATID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch { /* no crítico */ }
}

// ─── Notificaciones ───────────────────────────────────────────────────────────

async function guardarNotificacion(
  drive: ReturnType<typeof getDrive>,
  opts: {
    contrato: string;
    nit: string;
    prestador: string;
    total: number;
    meses: string[];
  }
) {
  const { contrato, nit, prestador, total, meses } = opts;
  const mesesLabel = meses.length
    ? meses.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleString('es-CO', { month: 'long', year: 'numeric' }); }).join(', ')
    : `${total} registro(s)`;

  const notifs: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'notificaciones.json')) ?? [];
  notifs.unshift({
    id: `sie-${contrato}-${Date.now()}`,
    tipo: 'sie_radicacion',
    titulo: `RIPS radicados — ${prestador}`,
    mensaje: `Radicación recibida en el SIE. Meses de prestación: ${mesesLabel}.`,
    contrato,
    nitPrestador: nit,   // para filtrar en la vista del prestador
    mesesCargados: meses,
    fecha: new Date().toISOString(),
    leidaPor: [],   // global: cada usuario marca su propia lectura
  });
  await writeJson(drive, ROOT_FOLDER_ID, 'notificaciones.json', notifs.slice(0, 200));
}

// ─── GET ──────────────────────────────────────────────────────────────────────

function isCronRequest(request: Request): boolean {
  return request.headers.get('x-cron-token') === process.env.CRON_SECRET && !!process.env.CRON_SECRET;
}

export async function GET(request: Request) {
  try {
    if (!isCronRequest(request)) {
      const user = await getCurrentUser(request);
      const isStaff = user?.rol === 'superadmin' || user?.rol === 'admin' || user?.rol === 'auditor';
      if (!isStaff) return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
    }

    const drive = getDrive();
    const estado: EstadoContrato[] = (await readJson(drive, ROOT_FOLDER_ID, MONITOREO_FILE)) ?? [];
    return NextResponse.json({ estados: estado, total: estado.length });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    if (!isCronRequest(request)) {
      const user = await getCurrentUser(request);
      const isStaff = user?.rol === 'superadmin' || user?.rol === 'admin' || user?.rol === 'auditor';
      if (!isStaff) return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const filtroContrato: string | undefined = body.contrato;

    const drive = getDrive();
    const prev: EstadoContrato[] = (await readJson(drive, ROOT_FOLDER_ID, MONITOREO_FILE)) ?? [];
    const estadoActual: Record<string, EstadoContrato> = {};
    for (const e of prev) estadoActual[e.contrato] = e;

    const sieClient = getSieClient();
    if (!(await sieClient.login())) {
      return NextResponse.json({ message: 'No se pudo autenticar en el SIE' }, { status: 502 });
    }

    const contratos = filtroContrato
      ? CONTRATOS_PGP.filter(c => c.contrato === filtroContrato)
      : CONTRATOS_PGP;

    const resultados: EstadoContrato[] = [];
    const nuevasRadicaciones: string[] = [];

    for (const contrato of contratos) {
      try {
        const { resultados: rips, hayDatos } = await sieClient.consultarContrato(contrato.contrato);
        const estados = [...new Set(rips.map(r => r.estado))];
        const prevEstado = estadoActual[contrato.contrato];
        const prevTotal = prevEstado?.totalRegistros ?? 0;
        // Preservar meses ya detectados de sesiones anteriores
        const mesesPrevios = new Set<string>(prevEstado?.mesesCargados ?? []);

        const mesesEsperados = getMesesEsperados(contrato.fechaInicio, contrato.fechaFin);

        const nuevoEstado: EstadoContrato = {
          contrato: contrato.contrato,
          prestador: contrato.prestador,
          nit: contrato.nit,
          ciudad: contrato.ciudad,
          departamento: contrato.departamento,
          hayRips: hayDatos,
          totalRegistros: rips.length,
          estados,
          ultimaConsulta: new Date().toISOString(),
          ultimaRadicacion: hayDatos ? (rips[0]?.fechaRecepcion ?? null) : null,
          mesesCargados: [...mesesPrevios].sort(),
          mesesEsperados,
        };

        // Nueva radicación → descargar JSONs, extraer meses, notificar
        if (hayDatos && rips.length > prevTotal) {
          nuevasRadicaciones.push(contrato.prestador);

          let mesesDeArchivos = new Set<string>(mesesPrevios);
          try {
            const archivos = await sieClient.descargarRipsDeUltimaConsulta(rips.length);
            const sieFolder = await getSubfolder(drive, ROOT_FOLDER_ID, 'sie_rips');
            for (const archivo of archivos) {
              let contenido: unknown = null;
              try { contenido = JSON.parse(archivo.content.toString('utf-8')); } catch { /* no JSON */ }
              // Extraer meses de prestación de este RIPS
              extractMesesFromRips(contenido).forEach(m => mesesDeArchivos.add(m));
              // Guardar pending para carga automática en JsonAnalyzerPage
              const nombre = `pending_${contrato.contrato}_${archivo.filename}`;
              await writeJson(drive, sieFolder, nombre, contenido ?? {});
            }
            nuevoEstado.archivosDescargados = archivos.length;
          } catch { /* no crítico */ }

          nuevoEstado.mesesCargados = [...mesesDeArchivos].sort();

          // Notificación a auditores + al propio prestador (por NIT)
          await guardarNotificacion(drive, {
            contrato: contrato.contrato,
            nit: contrato.nit,
            prestador: contrato.prestador,
            total: rips.length,
            meses: nuevoEstado.mesesCargados,
          });

          const mesesLabel = nuevoEstado.mesesCargados.join(', ') || `${rips.length} reg.`;
          await sendTelegram(
            `🏥 <b>Nueva Radicación RIPS</b>\n` +
            `Prestador: ${contrato.prestador}\n` +
            `Contrato: ${contrato.contrato}\n` +
            `Meses: ${mesesLabel}\n` +
            `Registros: ${rips.length} | Estado: ${estados.join(', ')}\n` +
            `Fecha: ${new Date().toLocaleString('es-CO')}`
          );
        }

        estadoActual[contrato.contrato] = nuevoEstado;
        resultados.push(nuevoEstado);
      } catch {
        const fallback: EstadoContrato = {
          contrato: contrato.contrato,
          prestador: contrato.prestador,
          nit: contrato.nit,
          ciudad: contrato.ciudad,
          departamento: contrato.departamento,
          hayRips: false,
          totalRegistros: 0,
          estados: ['Error de consulta'],
          ultimaConsulta: new Date().toISOString(),
          ultimaRadicacion: null,
          mesesCargados: estadoActual[contrato.contrato]?.mesesCargados ?? [],
          mesesEsperados: getMesesEsperados(contrato.fechaInicio, contrato.fechaFin),
        };
        estadoActual[contrato.contrato] = fallback;
        resultados.push(fallback);
      }
    }

    await writeJson(drive, ROOT_FOLDER_ID, MONITOREO_FILE, Object.values(estadoActual));

    return NextResponse.json({ consultados: resultados.length, nuevasRadicaciones, resultados });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
