/**
 * migrate-usuarios.mjs
 * Migra los usuarios de Supabase profiles → usuarios.json en Google Drive.
 * Ejecutar: node scripts/migrate-usuarios.mjs
 * Contraseña temporal asignada: Dusakawi2026.
 * Los usuarios deben cambiarla al primer ingreso.
 */

import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { Readable } from 'stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env.local');

// ── Leer .env.local ───────────────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const content = readFileSync(ENV_PATH, 'utf-8');
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

// ── Hash de contraseña (mismo algoritmo que auth-drive.ts) ───────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// ── Google Drive ──────────────────────────────────────────────────────────
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '1Xohpt2SoulRpQSR-yG-nF8gVQ2lLiB1M';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw !== 'PENDIENTE') {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  }
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:9876/callback');
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
  }
  throw new Error('No hay credenciales de Google Drive configuradas.');
}

const drive = google.drive({ version: 'v3', auth: getAuth() });

async function findFileId(name) {
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and name='${name}' and trashed=false`,
    fields: 'files(id)',
  });
  return res.data.files?.[0]?.id ?? null;
}

async function writeJson(name, data) {
  const body = Readable.from([JSON.stringify(data, null, 2)]);
  const existing = await findFileId(name);
  if (existing) {
    await drive.files.update({ fileId: existing, media: { mimeType: 'application/json', body } });
    console.log(`  ✏️  Actualizado: ${name}`);
  } else {
    await drive.files.create({
      requestBody: { name, parents: [FOLDER_ID], mimeType: 'application/json' },
      media: { mimeType: 'application/json', body },
      fields: 'id',
    });
    console.log(`  ➕ Creado: ${name}`);
  }
}

// ── Usuarios a migrar (desde profiles_rows.csv) ───────────────────────────
const TEMP_PASSWORD = 'Dusakawi2026.';

const USUARIOS_CSV = [
  { id: '837a4729-e805-4a39-8c4a-a70e6c905a9e', email: 'auditoraltocosto@dusakawiepsi.com',       nombre: 'MARÍA DANIELA GÓMEZ PASTOR',          rol: 'auditor',    activo: true, createdAt: '2026-04-13' },
  { id: '8bbc5078-60b3-4b89-b612-0e1737e3eb32', email: 'alexanderaraujo@dusakawiepsi.com',         nombre: 'ALEXANDER ARAUJO',                    rol: 'superadmin', activo: true, createdAt: '2026-04-16' },
  { id: 'ba16f472-7bf8-4e0f-88e5-729266a53cb9', email: 'yairvillazon@dusakawiepsi.com',            nombre: 'YAIR ENRIQUE VILLAZON MINDIOLA',       rol: 'auditor',    activo: true, createdAt: '2026-04-13' },
  { id: 'c1c6052c-7e6e-463f-a058-35627d2eddcd', email: 'supervisiondecontrato@dusakawiepsi.com',   nombre: 'Loren Mosquera Lozano',               rol: 'superadmin', activo: true, createdAt: '2026-05-12' },
  { id: 'cbb6550d-075d-4e41-b9ae-81fbb3c969bf', email: 'chprofesionalespecializado@dusakawiepsi.com', nombre: 'CLAUDIA PATRICIA HERRERA BARROS',  rol: 'auditor',    activo: true, createdAt: '2026-04-13' },
  { id: 'dbd9335e-69d9-4543-bd93-fd8dcb3623e3', email: 'diananavarro@dusakawiepsi.com',            nombre: 'DIANA NAVARRO IZQUIERDO',             rol: 'superadmin', activo: true, createdAt: '2026-04-13' },
  { id: 'e2c9557d-5dbf-438c-b914-b02e122e2806', email: 'egarcerant@dusakawiepsi.com',              nombre: 'EDUARDO LUIS GARCERANT GONZALEZ',     rol: 'superadmin', activo: true, createdAt: '2026-04-13' },
];

async function main() {
  console.log('\n🚀 Migrando usuarios a Google Drive...\n');
  console.log(`📁 Carpeta Drive: ${FOLDER_ID}`);
  console.log(`🔑 Contraseña temporal: ${TEMP_PASSWORD}\n`);

  const usuarios = USUARIOS_CSV.map(u => ({
    id:           u.id,
    email:        u.email.toLowerCase(),
    nombre:       u.nombre,
    rol:          u.rol,
    passwordHash: hashPassword(TEMP_PASSWORD),
    createdAt:    u.createdAt,
    activo:       u.activo,
    mustChangePassword: true, // forzar cambio en primer login (opcional)
  }));

  await writeJson('usuarios.json', usuarios);

  console.log('\n✅ Usuarios migrados exitosamente:\n');
  usuarios.forEach(u => {
    const icon = u.rol === 'superadmin' ? '👑' : '👤';
    console.log(`  ${icon} ${u.nombre.padEnd(40)} ${u.email}`);
  });

  console.log(`\n🔐 Contraseña temporal para todos: ${TEMP_PASSWORD}`);
  console.log('   (Cada usuario debe cambiarla al ingresar)\n');
}

main().catch(e => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
