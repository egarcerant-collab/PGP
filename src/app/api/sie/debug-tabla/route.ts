/**
 * GET /api/sie/debug-tabla?contrato=PGP-44001-2026-05-SM
 * Retorna el HTML de la primera fila de la tabla SIE para inspeccionar botones.
 */
import { NextResponse } from 'next/server';
import { getSieClient } from '@/lib/sie-client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contrato = searchParams.get('contrato') ?? 'PGP-44001-2026-05-SM';

  try {
    // Usar el cliente pero exponer HTML interno
    const SIE_BASE = process.env.SIE_URL ?? 'http://asdempleados.dusakawiepsi.com:8080/sie_dusakawi';
    const SIE_USER = process.env.SIE_USER ?? '';
    const SIE_PASS = process.env.SIE_PASS ?? '';
    const LOGIN_PATH = '/login.xhtml';
    const CONSULTA_PATH = '/pages/audit/reception_consulta_support_rips/reception_consulta_support_rips.xhtml';

    let cookies = '';
    const extractCookies = (headers: Headers) =>
      (headers.getSetCookie?.() ?? []).map((c: string) => c.split(';')[0]).join('; ');

    // 1. Login
    const r1 = await fetch(`${SIE_BASE}${LOGIN_PATH}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    });
    cookies = extractCookies(r1.headers);
    const html1 = await r1.text();
    const vs1 = html1.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)?.[1] ?? '';
    const textInputs = [...html1.matchAll(/name="([^"]+)"[^>]*type="text"|type="text"[^>]*name="([^"]+)"/g)]
      .map(m => m[1] ?? m[2]).filter(Boolean);
    const passInput = html1.match(/name="([^"]+)"[^>]*type="password"/)?.[1] ?? 'j_idt18:j_idt27';
    const formId = textInputs[0]?.split(':')[0] ?? 'j_idt18';
    const submitBtn = html1.match(/name="([^"]+)"[^>]*type="submit"/)?.[1] ?? `${formId}:j_idt40`;

    const loginBody = new URLSearchParams({
      [formId]: formId,
      [textInputs[0] ?? 'j_idt18:j_idt23']: SIE_USER,
      [passInput]: SIE_PASS,
      [textInputs[1] ?? 'j_idt18:j_idt31']: '2026',
      [submitBtn]: '',
      'javax.faces.ViewState': vs1,
    });
    const r2 = await fetch(`${SIE_BASE}${LOGIN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Referer: `${SIE_BASE}${LOGIN_PATH}`, Origin: SIE_BASE },
      body: loginBody.toString(),
      redirect: 'follow',
    });
    const nc2 = extractCookies(r2.headers);
    if (nc2) cookies = nc2;
    const loggedIn = r2.url.includes('home') || (await r2.text()).includes('logout');

    if (!loggedIn) return NextResponse.json({ error: 'Login fallido' }, { status: 401 });

    // 2. GET página consulta
    const r3 = await fetch(`${SIE_BASE}${CONSULTA_PATH}?SW_CREACION_EPS=1`, {
      headers: { Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      redirect: 'follow',
    });
    const nc3 = extractCookies(r3.headers);
    if (nc3) cookies = nc3;
    const html3 = await r3.text();
    const vs3 = html3.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)?.[1] ?? '';
    const estadoSelectId = html3.match(/<select[^>]*id="([^"]+)"[^>]*>[\s\S]*?<option[^>]*value="0"[^>]*>No Aplica/)?.[1] ?? 'j_idt123_input';

    // 3. POST búsqueda
    const searchBody = new URLSearchParams({
      formMtto: 'formMtto',
      j_idt102_input: '',
      txtRecepcionRipsC: '',
      txtNumeroContratoC: contrato,
      txtNumeroRadicadoC: '',
      j_idt119_input: '',
      j_idt119_hinput: '',
      j_idt123_focus: '',
      [estadoSelectId]: '0',
      j_idt129: '200',
      j_idt138_focus: '',
      j_idt138_input: '-1',
      j_idt144_focus: '',
      j_idt144_input: '-1',
      j_idt150: '',
      j_idt155: '',
      txtAfiliadoC: '',
      dtMttoT_selection: '',
      'javax.faces.ViewState': vs3,
      cmdBuscar: '',
    });
    const r4 = await fetch(`${SIE_BASE}${CONSULTA_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Referer: `${SIE_BASE}${CONSULTA_PATH}`, Origin: SIE_BASE },
      body: searchBody.toString(),
      redirect: 'follow',
    });
    const html4 = await r4.text();

    // Extraer primera fila del tbody
    const tbodyMatch = html4.match(/class="[^"]*ui-datatable-data[^"]*"[^>]*>([\s\S]*?)<\/tbody>/);
    const tbodyHtml = tbodyMatch?.[1] ?? '';
    const firstRowMatch = tbodyHtml.match(/<tr[^>]*class="[^"]*ui-widget-content[^"]*"[^>]*>([\s\S]*?)<\/tr>/);
    const firstRowHtml = firstRowMatch?.[1] ?? 'No se encontraron filas';

    // Extraer todos los botones con sus nombres e iconos
    const botones = [...firstRowHtml.matchAll(/name="([^"]+)"[^>]*>([\s\S]{0,500}?)(?=<\/(?:button|a|span))/g)]
      .map(m => ({
        name: m[1],
        iconClasses: [...m[2].matchAll(/class="([^"]*fa[^"]*)">/g)].map(i => i[1]),
        htmlSnippet: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100),
      }));

    // Probar descarga de cada botón que tiene nombre dtMttoT:0:XXX
    const resultadosDescarga: Array<{ btnId: string; icon: string; contentType: string; contentDisposition: string; sizeBytes: number; esJson: boolean; primeros100: string }> = [];
    const vs4 = html4.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)?.[1] ?? '';
    for (const btn of botones) {
      if (!btn.name.startsWith('dtMttoT:0:')) continue;
      try {
        const dlBody = new URLSearchParams({ ...searchBody as unknown as Record<string, string>, [btn.name]: '', 'javax.faces.ViewState': vs4 });
        const rdl = await fetch(`${SIE_BASE}${CONSULTA_PATH}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies, 'User-Agent': 'Mozilla/5.0', Referer: `${SIE_BASE}${CONSULTA_PATH}`, Origin: SIE_BASE },
          body: dlBody.toString(),
        });
        const nc = rdl.headers.getSetCookie?.().map((c: string) => c.split(';')[0]).join('; ') ?? '';
        if (nc) cookies = nc;
        const cd = rdl.headers.get('content-disposition') ?? '';
        const ct = rdl.headers.get('content-type') ?? '';
        if (!cd.includes('attachment')) {
          resultadosDescarga.push({ btnId: btn.name, icon: btn.iconClasses.join(' '), contentType: ct, contentDisposition: 'NO_ATTACHMENT', sizeBytes: 0, esJson: false, primeros100: '' });
          continue;
        }
        const ab = await rdl.arrayBuffer();
        const buf = Buffer.from(ab);
        let esJson = false;
        let primeros100 = buf.slice(0, 100).toString('utf-8').replace(/\r?\n/g, '\\n');
        try { JSON.parse(buf.toString('utf-8')); esJson = true; } catch { /* no JSON */ }
        resultadosDescarga.push({ btnId: btn.name, icon: btn.iconClasses.join(' '), contentType: ct, contentDisposition: cd, sizeBytes: buf.length, esJson, primeros100 });
      } catch (e: any) {
        resultadosDescarga.push({ btnId: btn.name, icon: btn.iconClasses.join(' '), contentType: 'ERROR', contentDisposition: e.message, sizeBytes: 0, esJson: false, primeros100: '' });
      }
    }

    return NextResponse.json({
      contrato,
      loggedIn,
      hayResultados: !html4.includes('No existen datos'),
      botones,
      resultadosDescarga,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
