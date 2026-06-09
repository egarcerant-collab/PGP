import { google } from 'googleapis';
import { Readable } from 'stream';

export const ROOT_FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1Xohpt2SoulRpQSR-yG-nF8gVQ2lLiB1M';

function getAuth() {
  // Opción 1: Service Account (producción / Vercel)
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw !== 'PENDIENTE') {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/drive'],
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
