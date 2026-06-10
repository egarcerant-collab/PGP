/**
 * update-password.mjs
 * Actualiza la contraseña de un usuario específico en usuarios.json de Drive.
 * Uso: node scripts/update-password.mjs
 */
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { Readable } from 'stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnvLocal() {
  try {
    const content = readFileSync(join(ROOT, '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}
loadEnvLocal();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1Xohpt2SoulRpQSR-yG-nF8gVQ2lLiB1M';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw !== 'PENDIENTE') {
    return new google.auth.GoogleAuth({ credentials: JSON.parse(raw), scopes: ['https://www.googleapis.com/auth/drive'] });
  }
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'http://localhost:9876/callback');
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return oauth2;
}

const drive = google.drive({ version: 'v3', auth: getAuth() });

async function findFileId(name) {
  const res = await drive.files.list({ q: `'${FOLDER_ID}' in parents and name='${name}' and trashed=false`, fields: 'files(id)' });
  return res.data.files?.[0]?.id ?? null;
}

async function readJson(name) {
  const id = await findFileId(name);
  if (!id) return null;
  const res = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' });
  return JSON.parse(Buffer.from(res.data).toString('utf-8'));
}

async function writeJson(name, data) {
  const body = Readable.from([JSON.stringify(data, null, 2)]);
  const id = await findFileId(name);
  if (id) {
    await drive.files.update({ fileId: id, media: { mimeType: 'application/json', body } });
  }
}

// ── Contraseñas específicas por usuario ───────────────────────────────────
const PASSWORDS = {
  'egarcerant@dusakawiepsi.com': 'Wanoseshas2015.',
};
const DEFAULT_PASSWORD = 'Dusakawi2026.';

async function main() {
  console.log('\n🔐 Actualizando contraseñas en usuarios.json...\n');
  const usuarios = await readJson('usuarios.json');
  if (!usuarios) { console.error('❌ No se encontró usuarios.json'); process.exit(1); }

  for (const u of usuarios) {
    const pwd = PASSWORDS[u.email.toLowerCase()] || DEFAULT_PASSWORD;
    u.passwordHash = hashPassword(pwd);
    u.mustChangePassword = !PASSWORDS[u.email.toLowerCase()]; // solo los de contraseña temporal
    const icon = PASSWORDS[u.email.toLowerCase()] ? '🔑' : '🔄';
    console.log(`  ${icon} ${u.nombre.padEnd(42)} → ${PASSWORDS[u.email.toLowerCase()] ? 'contraseña personal' : 'temporal: ' + DEFAULT_PASSWORD}`);
  }

  await writeJson('usuarios.json', usuarios);
  console.log('\n✅ Contraseñas actualizadas en Google Drive.\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
