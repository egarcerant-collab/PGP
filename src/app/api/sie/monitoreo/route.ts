/**
 * GET /api/sie/monitoreo
 * Revisa todos los contratos PGP en el SIE y retorna su estado de radicación.
 * Si hay nuevas radicaciones desde la última verificación, genera notificación.
 *
 * POST /api/sie/monitoreo  { contrato?: string }
 * Fuerza reconsulta de un contrato específico (o todos si no se pasa contrato).
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/get-current-user';
import { getSieClient } from '@/lib/sie-client';
import { CONTRATOS_PGP } from '@/lib/contratos-pgp';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from '@/lib/gdrive';

const MONITOREO_FILE = 'sie_monitoreo.json';

interface EstadoContrato {
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
}

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
  } catch {
    // Notificación no crítica, ignorar errores
  }
}

async function guardarNotificacionInterna(
  drive: ReturnType<typeof getDrive>,
  contrato: string,
  prestador: string,
  total: number
) {
  const notifs: any[] = (await readJson(drive, ROOT_FOLDER_ID, 'notificaciones.json')) ?? [];
  notifs.unshift({
    id: `sie-${contrato}-${Date.now()}`,
    tipo: 'sie_radicacion',
    titulo: `RIPS radicados — ${prestador}`,
    mensaje: `El prestador ${prestador} radicó ${total} registro(s) en el SIE para el contrato ${contrato}.`,
    contrato,
    fecha: new Date().toISOString(),
    leida: false,
  });
  // Mantener máximo 200 notificaciones
  await writeJson(drive, ROOT_FOLDER_ID, 'notificaciones.json', notifs.slice(0, 200));
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const isStaff =
      user?.rol === 'superadmin' || user?.rol === 'admin' || user?.rol === 'auditor';
    if (!isStaff) return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });

    const drive = getDrive();
    const estado: EstadoContrato[] = (await readJson(drive, ROOT_FOLDER_ID, MONITOREO_FILE)) ?? [];

    return NextResponse.json({ estados: estado, total: estado.length });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const isStaff =
      user?.rol === 'superadmin' || user?.rol === 'admin' || user?.rol === 'auditor';
    if (!isStaff) return NextResponse.json({ message: 'Acceso denegado' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const filtroContrato: string | undefined = body.contrato;

    const drive = getDrive();
    const estadoActual: Record<string, EstadoContrato> = {};
    const prev: EstadoContrato[] = (await readJson(drive, ROOT_FOLDER_ID, MONITOREO_FILE)) ?? [];
    for (const e of prev) estadoActual[e.contrato] = e;

    const sieClient = getSieClient();
    const sinLogin = await sieClient.login();
    if (!sinLogin) {
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
        };

        estadoActual[contrato.contrato] = nuevoEstado;
        resultados.push(nuevoEstado);

        // Detectar nueva radicación
        if (hayDatos && rips.length > prevTotal) {
          nuevasRadicaciones.push(contrato.prestador);
          await guardarNotificacionInterna(drive, contrato.contrato, contrato.prestador, rips.length);

          const msg =
            `🏥 <b>Nueva Radicación RIPS</b>\n` +
            `Prestador: ${contrato.prestador}\n` +
            `Contrato: ${contrato.contrato}\n` +
            `Registros: ${rips.length}\n` +
            `Estado: ${estados.join(', ')}\n` +
            `Fecha: ${new Date().toLocaleString('es-CO')}`;
          await sendTelegram(msg);
        }
      } catch (err) {
        // Continuar con el siguiente contrato si uno falla
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
        };
        estadoActual[contrato.contrato] = fallback;
        resultados.push(fallback);
      }
    }

    // Persistir estado completo
    const estadoFinal = Object.values(estadoActual);
    await writeJson(drive, ROOT_FOLDER_ID, MONITOREO_FILE, estadoFinal);

    return NextResponse.json({
      consultados: resultados.length,
      nuevasRadicaciones,
      resultados,
    });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
