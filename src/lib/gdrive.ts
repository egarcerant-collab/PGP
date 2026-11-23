import { google } from 'googleapis';
import { Readable } from 'stream';

export const ROOT_FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1Xohpt2SoulRpQSR-yG-nF8gVQ2lLiB1M';

const GDRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];

export const INFORMES_SHEET_ID = process.env.INFORMES_SHEET_ID || '1gD6R8g-4V2by_Ou80fMs4JbaDYTx89YUIo7FlyklD10';

function getAuth() {
  // Opción 1: Service Account (producción / Vercel)
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw !== 'PENDIENTE') {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: GDRIVE_SCOPES,
    });
  }

  // Opción 2: OAuth2 personal (local — ejecutar scripts/setup-drive-auth.mjs una sola vez)
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:9876/callback');
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
  }

  throw new Error(
    'Google Drive no configurado. ' +
    'Ejecuta: node scripts/setup-drive-auth.mjs  ' +
    'o agrega GOOGLE_SERVICE_ACCOUNT_JSON en .env.local'
  );
}

export function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

export function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

const SHEET_HEADERS = [
  'N° INFORME', 'PRESTADOR', 'NIT', 'CONTRATO', 'MUNICIPIO', 'DEPARTAMENTO',
  'PERÍODO', 'TIPO PERÍODO', 'FECHA', 'RESPONSABLE',
  'NT PERÍODO', 'TOTAL EJECUTADO', 'DESCONTAR', 'RECONOCER', 'VALOR FINAL',
  'TOTAL ANTICIPOS', 'CUPS INESPERADAS', 'GLOSA AUDITORÍA', 'COMENTARIOS GLOSA',
  'ÚLTIMA ACTUALIZACIÓN',
];

export async function syncInformesToSheet(informes: any[]): Promise<void> {
  const sheets = getSheets();
  const rows: any[][] = [SHEET_HEADERS];
  for (const inf of informes) {
    rows.push([
      inf.numero ?? '',
      inf.prestador ?? '',
      inf.nit ?? '',
      inf.contrato ?? '',
      inf.municipio ?? '',
      inf.departamento ?? '',
      inf.periodo ?? '',
      inf.tipo_periodo ?? '',
      inf.fecha ?? '',
      inf.responsable ?? '',
      inf.nt_periodo ?? 0,
      inf.total_ejecutado ?? 0,
      inf.descontar ?? 0,
      inf.reconocer ?? 0,
      inf.valor_final ?? 0,
      inf.total_anticipos ?? 0,
      inf.pdf_data?.valorCupsInesperadas ?? 0,
      inf.pdf_data?.descontarGlosa ?? 0,
      inf.comentariosGlosa ?? '',
      new Date().toISOString(),
    ]);
  }
  const sheetRange = `Hoja 1!A1:T${rows.length}`;
  // Limpiar y reescribir completo (garantiza consistencia)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: INFORMES_SHEET_ID,
    range: 'Hoja 1!A:T',
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: INFORMES_SHEET_ID,
    range: sheetRange,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

type DriveClient = ReturnType<typeof getDrive>;
const _fc: Record<string, string> = {};

export async function getSubfolder(drive: DriveClient, parentId: string, name: string): Promise<string> {
  const k = `${parentId}|${name}`;
  if (_fc[k]) return _fc[k];
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (res.data.files?.length) {
    _fc[k] = res.data.files[0].id!;
    return _fc[k];
  }
  const f = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  _fc[k] = f.data.id!;
  return _fc[k];
}

async function findId(drive: DriveClient, folderId: string, name: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${name}' and trashed=false`,
    fields: 'files(id)',
  });
  return res.data.files?.[0]?.id ?? null;
}

export async function readJson<T = any>(drive: DriveClient, folderId: string, name: string): Promise<T | null> {
  const id = await findId(drive, folderId, name);
  if (!id) return null;
  const res = await drive.files.get(
    { fileId: id, alt: 'media' },
    { responseType: 'arraybuffer' },
  ) as any;
  const text = Buffer.from(res.data).toString('utf-8');
  return JSON.parse(text) as T;
}

export async function writeJson(drive: DriveClient, folderId: string, name: string, data: unknown): Promise<void> {
  const body = Readable.from([JSON.stringify(data, null, 2)]);
  const eid = await findId(drive, folderId, name);
  if (eid) {
    await drive.files.update({ fileId: eid, media: { mimeType: 'application/json', body } });
  } else {
    await drive.files.create({
      requestBody: { name, parents: [folderId], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body },
      fields: 'id',
    });
  }
}

/** Guarda un buffer binario o texto arbitrario (e.g. archivo plano RIPS) */
export async function writeBuffer(
  drive: DriveClient,
  folderId: string,
  name: string,
  buffer: Buffer,
  mimeType = 'application/octet-stream',
): Promise<void> {
  const body = Readable.from([buffer]);
  const eid = await findId(drive, folderId, name);
  if (eid) {
    await drive.files.update({ fileId: eid, media: { mimeType, body } });
  } else {
    await drive.files.create({
      requestBody: { name, parents: [folderId], mimeType },
      media: { mimeType, body },
      fields: 'id',
    });
  }
}

export async function deleteJson(drive: DriveClient, folderId: string, name: string): Promise<boolean> {
  const id = await findId(drive, folderId, name);
  if (!id) return false;
  await drive.files.delete({ fileId: id });
  return true;
}

export async function listFiles(drive: DriveClient, folderId: string): Promise<Array<{ id: string; name: string }>> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name)',
    pageSize: 1000,
  });
  return res.data.files?.map(f => ({ id: f.id!, name: f.name! })) ?? [];
}

export async function uploadFile(
  drive: DriveClient,
  folderId: string,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ id: string; webViewLink: string }> {
  const body = Readable.from([buffer]);
  const existing = await findId(drive, folderId, name);
  if (existing) {
    await drive.files.update({ fileId: existing, media: { mimeType, body } });
    await drive.permissions.create({ fileId: existing, requestBody: { role: 'reader', type: 'anyone' } }).catch(() => {});
    const f = await drive.files.get({ fileId: existing, fields: 'webViewLink' });
    return { id: existing, webViewLink: f.data.webViewLink || `https://drive.google.com/file/d/${existing}/view` };
  }
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId], mimeType },
    media: { mimeType, body },
    fields: 'id,webViewLink',
  });
  const fileId = res.data.id!;
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } }).catch(() => {});
  return { id: fileId, webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view` };
}
