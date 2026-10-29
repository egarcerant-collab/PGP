/**
 * Cliente HTTP para el SIE (Sistema de Información Empresarial)
 * Consulta recepciones RIPS por número de contrato PGP
 */

const SIE_BASE = process.env.SIE_URL ?? 'http://asdempleados.dusakawiepsi.com:8080/sie_dusakawi';
const SIE_USER = process.env.SIE_USER ?? '';
const SIE_PASS = process.env.SIE_PASS ?? '';

const LOGIN_PATH = '/login.xhtml';
const CONSULTA_PATH = '/pages/audit/reception_consulta_support_rips/reception_consulta_support_rips.xhtml';

export interface RecepcionRips {
  recepcionId: string;
  nit: string;
  prestador: string;
  fechaRecepcion: string;
  contrato: string;
  tipoContrato: string;
  cantidadAF: string;
  valorAF: string;
  tipo: string;
  estado: string;
  numeroRadicacion: string;
  tipoRegimen: string;
}

function extractCookies(headers: Headers): string {
  // getSetCookie() returns array of Set-Cookie header values
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map(c => c.split(';')[0]).join('; ');
}

function mergeCookies(base: string, incoming: string): string {
  const map = new Map<string, string>();
  for (const pair of (base + '; ' + incoming).split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) map.set(k, v);
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractViewState(html: string): string {
  const m = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/);
  return m?.[1] ?? '';
}

function noData(html: string): boolean {
  return html.includes('No existen datos para mostrar') || html.includes('no existen datos');
}

/** Parsea filas de la tabla de Consulta Recepción */
function parseResultados(html: string, contrato: string): RecepcionRips[] {
  if (noData(html)) return [];

  const resultados: RecepcionRips[] = [];

  // Cada fila tiene: Recepción-RIPS | NIT IPS | Nombre IPS | Fecha | Usuario | Contrato | TipoContrato | CantAF | ValorAF | Tipo | Estado | NroRad | TipoReg | PBS | CUV
  // Usamos bloques delimitados por los botones de acción
  const blockPattern = /(\d{2,6})\s+(\d{8,12})\s+([A-ZÁÉÍÓÚÑ\w\s\.\-&,]+?)\s+(\d{4}\/\d{2}\/\d{2}[^<\t\n]*?)\s+(\w+)\s+([\w\-]*)\s+([\w\sRS]*?)\s+(\d+)\s+\$([\d\.,]+)\s+(Factura RIPS|Evento RIPS|Capita RIPS|Factura)\s+(Recepcionado|Radicado|Pre Radicado|Devuelto|Gestionado|Anulado|Radicado con devolución|Radicado pendiente|Revisión pendiente|Devuelto Parcial|En Revisión|Registro de Ajuste|Devuelto Registro de Ajuste)/g;

  let m: RegExpExecArray | null;
  while ((m = blockPattern.exec(html)) !== null) {
    resultados.push({
      recepcionId: m[1].trim(),
      nit: m[2].trim(),
      prestador: m[3].trim(),
      fechaRecepcion: m[4].trim(),
      contrato,
      tipoContrato: m[7].trim(),
      cantidadAF: m[8].trim(),
      valorAF: m[9].trim(),
      tipo: m[10].trim(),
      estado: m[11].trim(),
      numeroRadicacion: '',
      tipoRegimen: '',
    });
  }

  return resultados;
}

export class SieClient {
  private cookies = '';
  private loggedIn = false;

  private async fetchUrl(url: string, opts: RequestInit = {}): Promise<{ html: string; ok: boolean; finalUrl: string }> {
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...((opts.headers as Record<string, string>) ?? {}),
        Cookie: this.cookies,
        'User-Agent': 'Mozilla/5.0 (compatible; PGP-Monitor/1.0)',
      },
      redirect: 'follow',
    });
    const newCookies = extractCookies(res.headers);
    if (newCookies) this.cookies = mergeCookies(this.cookies, newCookies);
    const html = await res.text();
    return { html, ok: res.ok, finalUrl: res.url };
  }

  async login(): Promise<boolean> {
    try {
      // 1. GET login.xhtml para obtener ViewState, cookies y IDs de campos JSF dinámicos
      const { html: loginHtml } = await this.fetchUrl(`${SIE_BASE}${LOGIN_PATH}`);
      const viewState = extractViewState(loginHtml);

      // Extraer IDs dinámicos: buscar campos por type en el HTML
      const textInputs = [...loginHtml.matchAll(/name="([^"]+)"[^>]*type="text"|type="text"[^>]*name="([^"]+)"/g)]
        .map(m => m[1] ?? m[2]).filter(Boolean);
      const passInput = (loginHtml.match(/name="([^"]+)"[^>]*type="password"/)
        ?? loginHtml.match(/type="password"[^>]*name="([^"]+)"/))?.[1]
        ?? 'j_idt18:j_idt27';
      const userField = textInputs[0] ?? 'j_idt18:j_idt23';
      const yearField = textInputs[1] ?? 'j_idt18:j_idt31';
      // El form ID JSF es el prefijo antes de ":" en cualquier campo
      const formId = userField.includes(':') ? userField.split(':')[0] : 'j_idt18';

      // Extraer el botón submit (JSF requiere que se incluya en el POST)
      const submitBtn = loginHtml.match(/name="([^"]+)"[^>]*type="submit"|type="submit"[^>]*name="([^"]+)"/)?.[1]
        ?? loginHtml.match(/<button[^>]+name="([^"]+)"[^>]*type="submit"/)?.[1]
        ?? loginHtml.match(/type="submit"[^>]*name="([^"]+)"/)?.[2]
        ?? `${formId}:j_idt40`;

      // 2. POST credenciales con los IDs extraídos (botón incluido — JSF lo requiere para ejecutar la acción)
      const formBody = new URLSearchParams({
        [formId]: formId,
        [userField]: SIE_USER,
        [passInput]: SIE_PASS,
        [yearField]: '2026',
        [submitBtn]: '',
        'javax.faces.ViewState': viewState,
      });

      const loginUrl = `${SIE_BASE}${LOGIN_PATH}`;
      const { html: postHtml, finalUrl } = await this.fetchUrl(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': loginUrl,
          'Origin': SIE_BASE,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-CO,es;q=0.9',
        },
        body: formBody.toString(),
      });

      // Login exitoso si la URL final ya no es login.xhtml, o si el HTML no tiene form de login
      this.loggedIn =
        !finalUrl.includes('login.xhtml') ||
        postHtml.includes('logout') ||
        postHtml.includes('Cerrar Sesi') ||
        (!postHtml.includes('ingrese al sistema') && !postHtml.includes('type="password"'));

      return this.loggedIn;
    } catch {
      return false;
    }
  }

  async consultarContrato(numeroContrato: string): Promise<{ resultados: RecepcionRips[]; hayDatos: boolean }> {
    if (!this.loggedIn) {
      const ok = await this.login();
      if (!ok) return { resultados: [], hayDatos: false };
    }

    // 1. GET la página de consulta para obtener ViewState y IDs de campos
    const { html: pageHtml } = await this.fetchUrl(
      `${SIE_BASE}${CONSULTA_PATH}?SW_CREACION_EPS=1`
    );
    const viewState = extractViewState(pageHtml);
    if (!viewState) {
      this.loggedIn = false;
      return this.consultarContrato(numeroContrato);
    }

    // Detectar el ID del formulario de filtros
    const formMatch = pageHtml.match(/id="(form[A-Za-z0-9_]+)"[^>]*method="post"/i);
    const formId = formMatch?.[1] ?? 'formFiltroRecepcion';

    // 2. POST búsqueda con número de contrato y estado vacío (No Aplica)
    const body = new URLSearchParams({
      [formId]: formId,
      [`${formId}:txtNumeroContratoPrestador`]: numeroContrato,
      [`${formId}:cmbEstado`]: '',
      [`${formId}:txtCantidad`]: '200',
      'javax.faces.ViewState': viewState,
      'javax.faces.source': `${formId}:cmdBuscar`,
      'javax.faces.partial.event': 'click',
      'javax.faces.partial.execute': `${formId}`,
      'javax.faces.partial.render': `${formId}`,
      'javax.faces.behavior.event': 'click',
    });

    const { html: resultHtml } = await this.fetchUrl(`${SIE_BASE}${CONSULTA_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Faces-Request': 'partial/ajax',
      },
      body: body.toString(),
    });

    const resultados = parseResultados(resultHtml, numeroContrato);
    const hayDatos = resultados.length > 0;

    return { resultados, hayDatos };
  }
}

export function getSieClient(): SieClient {
  return new SieClient();
}
