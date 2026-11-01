/**
 * Cliente HTTP para el SIE (Sistema de Información Empresarial)
 * Consulta y descarga recepciones RIPS por número de contrato PGP
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

export interface RipsDescargado {
  recepcionId: string;
  filename: string;
  content: Buffer;
  contentType: string;
}

// ─── Cookie utilities ─────────────────────────────────────────────────────────

function extractCookies(headers: Headers): string {
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

// ─── HTML extraction helpers ──────────────────────────────────────────────────

function extractViewState(html: string): string {
  return html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)?.[1] ?? '';
}

function cellText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extrae las filas de la tabla de resultados */
function parseResultadosFromHtml(html: string, contrato: string): {
  resultados: RecepcionRips[];
  downloadBtnSuffix: string;  // e.g. "j_idt181" para botón de descarga col 3
  rowCount: number;
} {
  const empty = { resultados: [], downloadBtnSuffix: 'j_idt181', rowCount: 0 };

  if (html.includes('No existen datos para mostrar') || html.includes('no existen datos')) {
    return empty;
  }

  // Encontrar tbody de la tabla de resultados
  const tbodyMatch = html.match(/class="[^"]*ui-datatable-data[^"]*"[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return empty;

  const tbodyHtml = tbodyMatch[1];
  const resultados: RecepcionRips[] = [];
  let downloadBtnSuffix = 'j_idt181';

  const rowRegex = /<tr[^>]*class="[^"]*ui-widget-content[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tbodyHtml)) !== null) {
    const rowHtml = rowMatch[1];

    // Extraer sufijo del botón de descarga (fa-file-o) de la primera fila
    if (resultados.length === 0) {
      const btnMatch = rowHtml.match(/name="dtMttoT:\d+:(j_idt\d+)"[^>]*>[\s\S]{0,300}?fa-file-o/);
      if (btnMatch) downloadBtnSuffix = btnMatch[1];
    }

    // Extraer celdas
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      cells.push(cellText(tdMatch[1]));
    }

    // Columnas de datos comienzan en el índice 9 (las primeras 9 son botones de acción)
    if (cells.length >= 19 && cells[9]?.trim()) {
      const nitPrestador = cells[10].split(/\s+/).filter(Boolean);
      resultados.push({
        recepcionId: cells[9].trim(),
        nit: nitPrestador[0] ?? '',
        prestador: nitPrestador.slice(1).join(' '),
        fechaRecepcion: cells[11].trim(),
        contrato: cells[13].trim() || contrato,
        tipoContrato: cells[14].trim(),
        cantidadAF: cells[15].trim(),
        valorAF: cells[16].trim(),
        tipo: cells[17].trim(),
        estado: cells[18].trim(),
        numeroRadicacion: cells[19]?.trim() ?? '',
        tipoRegimen: cells[20]?.trim() ?? '',
      });
    }
  }

  return { resultados, downloadBtnSuffix, rowCount: resultados.length };
}

/** Extrae el ID del select de Estado buscando la opción "No Aplica" */
function extractEstadoSelectId(html: string): string {
  return html.match(/<select[^>]*id="([^"]+)"[^>]*>[\s\S]*?<option[^>]*value="0"[^>]*>No Aplica/)?.[1]
    ?? html.match(/id="([^"]+_input)"[^>]*>\s*<option[^>]*value="0"[^>]*>No Aplica/)?.[1]
    ?? 'j_idt123_input';
}

// ─── SieClient ────────────────────────────────────────────────────────────────

export class SieClient {
  private cookies = '';
  private loggedIn = false;
  // Estado de la última consulta (necesario para descargar)
  private lastFormBase: Record<string, string> = {};
  private lastViewState = '';
  private lastDownloadBtnSuffix = 'j_idt181';

  private async fetchUrl(
    url: string,
    opts: RequestInit = {},
  ): Promise<{ html: string; ok: boolean; finalUrl: string; headers: Headers }> {
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...((opts.headers as Record<string, string>) ?? {}),
        Cookie: this.cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9',
      },
      redirect: 'follow',
    });
    const newCookies = extractCookies(res.headers);
    if (newCookies) this.cookies = mergeCookies(this.cookies, newCookies);
    const html = await res.text();
    return { html, ok: res.ok, finalUrl: res.url, headers: res.headers };
  }

  /** Descarga un recurso como binario (para JSON/ZIP de RIPS) */
  private async fetchBinary(
    url: string,
    opts: RequestInit = {},
  ): Promise<{ data: Buffer; contentType: string; contentDisposition: string; ok: boolean }> {
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...((opts.headers as Record<string, string>) ?? {}),
        Cookie: this.cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
      redirect: 'follow',
    });
    const newCookies = extractCookies(res.headers);
    if (newCookies) this.cookies = mergeCookies(this.cookies, newCookies);
    const arrayBuf = await res.arrayBuffer();
    return {
      data: Buffer.from(arrayBuf),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      contentDisposition: res.headers.get('content-disposition') ?? '',
      ok: res.ok,
    };
  }

  async login(): Promise<boolean> {
    try {
      const loginUrl = `${SIE_BASE}${LOGIN_PATH}`;

      // 1. GET login para obtener ViewState y cookies
      const { html: loginHtml } = await this.fetchUrl(loginUrl);
      const viewState = extractViewState(loginHtml);

      // Extraer IDs de campos dinámicamente
      const textInputs = [...loginHtml.matchAll(/name="([^"]+)"[^>]*type="text"|type="text"[^>]*name="([^"]+)"/g)]
        .map(m => m[1] ?? m[2]).filter(Boolean);
      const passInput = (loginHtml.match(/name="([^"]+)"[^>]*type="password"/)
        ?? loginHtml.match(/type="password"[^>]*name="([^"]+)"/))?.[1]
        ?? 'j_idt18:j_idt27';
      const userField = textInputs[0] ?? 'j_idt18:j_idt23';
      const yearField = textInputs[1] ?? 'j_idt18:j_idt31';
      const formId = userField.includes(':') ? userField.split(':')[0] : 'j_idt18';
      const submitBtn = (loginHtml.match(/name="([^"]+)"[^>]*type="submit"/)
        ?? loginHtml.match(/<button[^>]+name="([^"]+)"[^>]*type="submit"/)
        ?? loginHtml.match(/type="submit"[^>]*name="([^"]+)"/))?.[1]
        ?? `${formId}:j_idt40`;

      // 2. POST credenciales (incluir botón submit — JSF lo requiere para ejecutar la acción)
      const formBody = new URLSearchParams({
        [formId]: formId,
        [userField]: SIE_USER,
        [passInput]: SIE_PASS,
        [yearField]: '2026',
        [submitBtn]: '',
        'javax.faces.ViewState': viewState,
      });

      const { html: postHtml, finalUrl } = await this.fetchUrl(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': loginUrl,
          'Origin': SIE_BASE,
        },
        body: formBody.toString(),
      });

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

    // 1. GET página de consulta
    const consultaUrl = `${SIE_BASE}${CONSULTA_PATH}?SW_CREACION_EPS=1`;
    const { html: pageHtml } = await this.fetchUrl(consultaUrl);
    const viewState = extractViewState(pageHtml);
    if (!viewState) {
      this.loggedIn = false;
      return { resultados: [], hayDatos: false };
    }

    const estadoSelectId = extractEstadoSelectId(pageHtml);

    // Base del formulario — todos los campos que el browser enviaría
    const formBase: Record<string, string> = {
      formMtto: 'formMtto',
      j_idt102_input: '',
      txtRecepcionRipsC: '',
      txtNumeroContratoC: numeroContrato,
      txtNumeroRadicadoC: '',
      j_idt119_input: '',
      j_idt119_hinput: '',
      j_idt123_focus: '',
      [estadoSelectId]: '0',  // No Aplica
      j_idt129: '200',        // Cantidad
      j_idt138_focus: '',
      j_idt138_input: '-1',
      j_idt144_focus: '',
      j_idt144_input: '-1',
      j_idt150: '',
      j_idt155: '',
      txtAfiliadoC: '',
      dtMttoT_selection: '',
      'javax.faces.ViewState': viewState,
    };

    // 2. POST búsqueda (POST normal, no AJAX, para obtener HTML completo)
    const searchBody = new URLSearchParams({ ...formBase, cmdBuscar: '' });
    const { html: resultHtml } = await this.fetchUrl(`${SIE_BASE}${CONSULTA_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': consultaUrl,
        'Origin': SIE_BASE,
      },
      body: searchBody.toString(),
    });

    // 3. Parsear tabla de resultados
    const { resultados, downloadBtnSuffix, rowCount } = parseResultadosFromHtml(resultHtml, numeroContrato);

    // Guardar estado para descargas posteriores
    this.lastViewState = extractViewState(resultHtml) || viewState;
    this.lastDownloadBtnSuffix = downloadBtnSuffix;
    this.lastFormBase = { ...formBase, 'javax.faces.ViewState': this.lastViewState };

    return { resultados, hayDatos: rowCount > 0 };
  }

  /**
   * Descarga los archivos RIPS de cada fila del último resultado de consultarContrato.
   * Retorna los buffers con el contenido de cada archivo.
   */
  async descargarRipsDeUltimaConsulta(maxRows = 10, indices?: number[]): Promise<RipsDescargado[]> {
    if (!this.lastViewState || Object.keys(this.lastFormBase).length === 0) {
      throw new Error('Debe llamar consultarContrato antes de descargar');
    }

    const descargados: RipsDescargado[] = [];
    const rowsToFetch = indices ?? Array.from({ length: maxRows }, (_, i) => i);

    for (const rowIndex of rowsToFetch) {
      const downloadBtnId = `dtMttoT:${rowIndex}:${this.lastDownloadBtnSuffix}`;
      const body = new URLSearchParams({
        ...this.lastFormBase,
        [downloadBtnId]: '',
      });

      try {
        const { data, contentType, contentDisposition, ok } = await this.fetchBinary(
          `${SIE_BASE}${CONSULTA_PATH}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Referer': `${SIE_BASE}${CONSULTA_PATH}`,
              'Origin': SIE_BASE,
            },
            body: body.toString(),
          }
        );

        if (!ok || !contentDisposition.includes('attachment')) continue;

        const filename = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'"\n;]+)\1/)?.[2]
          ?? contentDisposition.match(/filename\*=UTF-8''([^\s;]+)/)?.[1]
          ?? `rips_row${rowIndex}_${Date.now()}.json`;

        descargados.push({
          recepcionId: `row${rowIndex}`,
          filename: decodeURIComponent(filename),
          content: data,
          contentType,
        });
      } catch {
        break; // Si falla una fila, detenemos
      }
    }

    return descargados;
  }
}

export function getSieClient(): SieClient {
  return new SieClient();
}

/**
 * Extrae meses de cobertura de un "Archivo Plano" RIPS (Res. 3374).
 * Los años de servicio son >= 2024, excluyendo fechas de nacimiento (décadas anteriores).
 */
export function extractMesesFromArchivoPlano(contenido: string): string[] {
  const meses = new Set<string>();
  for (const m of contenido.matchAll(/\b(20(?:2[4-9]|\d{2}))-(\d{2})-\d{2}\b/g)) {
    meses.add(`${m[1]}-${m[2]}`);
  }
  return [...meses].sort();
}

/**
 * Detecta si un buffer es un archivo plano RIPS (Res. 3374) basado en marcadores de sección.
 */
export function isArchivoPlanoRips(content: Buffer): boolean {
  const sample = content.slice(0, 500).toString('latin1');
  return /ARCHIVO-USUARIOS|ARCHIVO-CONSULTA|ARCHIVO-URGENCIAS|ARCHIVO-HOSPITALIZACION/i.test(sample);
}

/**
 * Convierte un Archivo Plano RIPS (Res. 3374) en un JSON estructurado compatible con el analizador.
 * Genera el array `usuarios` en formato Res. 2275 para que el analizador pueda procesarlo.
 */
export function parsearArchivoPlano(content: Buffer, meta: { contrato: string; radicacion: string; fechaRecepcion: string }) {
  const text = content.toString('latin1');
  const meses = extractMesesFromArchivoPlano(text);

  // ── Extraer secciones del archivo plano ──────────────────────────────────────
  const sections: Record<string, string[]> = {};
  let currentSection = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim().replace(/\|$/, '').trim();
    const secMatch = line.match(/----\s*(ARCHIVO-[\w-]+)\s*----/i);
    if (secMatch) {
      currentSection = secMatch[1].toUpperCase();
      if (!sections[currentSection]) sections[currentSection] = [];
      continue;
    }
    if (currentSection && line && !line.startsWith('*') && line.includes(',')) {
      sections[currentSection].push(line);
    }
  }

  const secciones: Record<string, number> = {};
  for (const [k, v] of Object.entries(sections)) secciones[k.replace('ARCHIVO-', '')] = v.length;

  // ── Parsear pacientes (USUARIOS) ──────────────────────────────────────────────
  // Formato: tipo_doc,num_doc,tipo_usuario,fecha_nac,sexo,dep_res,mun_res,tipo_afil,zona,mun_aten
  const pacienteMap = new Map<string, {
    tipoDocumentoIdentificacion: string;
    numDocumentoIdentificacion: string;
    fechaNacimiento?: string;
    sexo?: string;
    consultas: unknown[];
    procedimientos: unknown[];
    hospitalizacion: unknown[];
    medicamentos: unknown[];
    otrosServicios: unknown[];
  }>();

  const tiposDoc = new Set(['CC','TI','CE','RC','PA','PE','CD','MS','AS','NV']);
  for (const line of sections['ARCHIVO-USUARIOS'] ?? []) {
    const c = line.split(',');
    if (c.length >= 2 && tiposDoc.has(c[0].trim())) {
      const key = `${c[0].trim()}-${c[1].trim()}`;
      if (!pacienteMap.has(key)) {
        pacienteMap.set(key, {
          tipoDocumentoIdentificacion: c[0].trim(),
          numDocumentoIdentificacion: c[1].trim(),
          fechaNacimiento: c[3]?.trim() || undefined,
          sexo: c[4]?.trim() || undefined,
          consultas: [], procedimientos: [], hospitalizacion: [], medicamentos: [], otrosServicios: [],
        });
      }
    }
  }

  // ── Helper: obtener o crear paciente ─────────────────────────────────────────
  const getPaciente = (tipo: string, doc: string) => {
    const key = `${tipo}-${doc}`;
    if (!pacienteMap.has(key)) {
      pacienteMap.set(key, { tipoDocumentoIdentificacion: tipo, numDocumentoIdentificacion: doc, consultas: [], procedimientos: [], hospitalizacion: [], medicamentos: [], otrosServicios: [] });
    }
    return pacienteMap.get(key)!;
  };

  // ── Parsear CONSULTAS ─────────────────────────────────────────────────────────
  // Cols: factura, tipo_doc, num_doc, nit_prestador, fecha_consulta, ?, cod_cups, tipo_aten, finalidad, ...
  const consultasKey = Object.keys(sections).find(k => k.includes('CONSULTA')) ?? 'ARCHIVO-CONSULTAS';
  for (const line of sections[consultasKey] ?? []) {
    const c = line.split(',');
    if (c.length < 7) continue;
    const tipo = c[1]?.trim(); const doc = c[2]?.trim();
    if (!tipo || !doc || !tiposDoc.has(tipo)) continue;
    const fecha = c[4]?.trim().split(' ')[0] ?? '';
    const pac = getPaciente(tipo, doc);
    pac.consultas.push({
      codPrestador: c[3]?.trim() ?? '',
      fechaInicioAtencion: fecha,
      codServicio: c[6]?.trim() ?? '',
      vrServicio: parseFloat(c[19]?.trim() ?? '0') || 0,
      consecutivo: c[c.length - 2]?.trim() ?? '',
    });
  }

  // ── Parsear PROCEDIMIENTOS ────────────────────────────────────────────────────
  const procKey = Object.keys(sections).find(k => k.includes('PROCEDIMIENTO')) ?? 'ARCHIVO-PROCEDIMIENTOS';
  for (const line of sections[procKey] ?? []) {
    const c = line.split(',');
    if (c.length < 7) continue;
    const tipo = c[1]?.trim(); const doc = c[2]?.trim();
    if (!tipo || !doc || !tiposDoc.has(tipo)) continue;
    const fecha = c[4]?.trim().split(' ')[0] ?? '';
    const pac = getPaciente(tipo, doc);
    pac.procedimientos.push({
      codPrestador: c[3]?.trim() ?? '',
      fechaInicioAtencion: fecha,
      idServicio: c[7]?.trim() ?? '',
      vrServicio: parseFloat(c[18]?.trim() ?? '0') || 0,
    });
  }

  // ── Parsear HOSPITALIZACION ───────────────────────────────────────────────────
  const hospKey = Object.keys(sections).find(k => k.includes('HOSPITALIZACION')) ?? 'ARCHIVO-HOSPITALIZACION';
  for (const line of sections[hospKey] ?? []) {
    const c = line.split(',');
    if (c.length < 6) continue;
    const tipo = c[1]?.trim(); const doc = c[2]?.trim();
    if (!tipo || !doc || !tiposDoc.has(tipo)) continue;
    const fecha = c[4]?.trim().split(' ')[0] ?? '';
    const pac = getPaciente(tipo, doc);
    pac.hospitalizacion.push({
      codPrestador: c[3]?.trim() ?? '',
      fechaInicioAtencion: fecha,
      vrServicio: parseFloat(c[20]?.trim() ?? '0') || 0,
    });
  }

  // ── Construir array usuarios compatible con Res. 2275 ─────────────────────────
  const codPrestador = meta.contrato.match(/^PGP-(\d+)-/)?.[1]
    ? `${meta.contrato.match(/^PGP-(\d+)-/)![1]}` : '';

  const usuarios = [...pacienteMap.values()].map(p => ({
    tipoDocumentoIdentificacion: p.tipoDocumentoIdentificacion,
    numDocumentoIdentificacion: p.numDocumentoIdentificacion,
    fechaNacimiento: p.fechaNacimiento,
    sexo: p.sexo,
    servicios: {
      consultas: p.consultas,
      procedimientos: p.procedimientos,
      hospitalizacion: p.hospitalizacion,
      medicamentos: p.medicamentos,
      otrosServicios: p.otrosServicios,
    },
  }));

  return {
    formato: 'archivo_plano_rips_3374',
    numDocumentoIdObligado: codPrestador,
    ...meta,
    mesesCobertura: meses,
    secciones,
    totalRegistros: Object.values(secciones).reduce((a, b) => a + b, 0),
    // Array de usuarios en formato compatible con Res. 2275 para el analizador
    usuarios,
    contenidoBruto: text.slice(0, 5_000),
  };
}
