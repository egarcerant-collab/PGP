/**
 * auth-drive.ts
 * Autenticación completa basada en Google Drive + JWT.
 * Reemplaza Supabase Auth para uso local y producción sin cuota.
 */

import crypto from 'crypto';
import { getDrive, readJson, writeJson, ROOT_FOLDER_ID } from './gdrive';

const JWT_SECRET = process.env.JWT_SECRET || 'pgp-dusakawi-secret-2026';
const USUARIOS_FILE = 'usuarios.json';
const COOKIE_NAME = 'pgp_session';
const TOKEN_EXPIRY_HOURS = 24;

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface DriveUser {
  id: string;
  email: string;
  nombre: string;
  rol: 'superadmin' | 'admin' | 'auditor';
  passwordHash: string;
  createdAt: string;
  activo: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  nombre: string;
  rol: string;
}

// ── Hash de contraseña (PBKDF2 nativo, sin dependencias extra) ───────────

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const attempt = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

// ── JWT simple (sin dependencias externas) ────────────────────────────────

function base64url(data: string): string {
  return Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

export function signJWT(payload: SessionUser): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_HOURS * 3600;
  const body = base64url(JSON.stringify({ ...payload, exp, iat: Math.floor(Date.now() / 1000) }));
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJWT(token: string): SessionUser | null {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(fromBase64url(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: payload.id, email: payload.email, nombre: payload.nombre, rol: payload.rol };
  } catch {
    return null;
  }
}

// ── Operaciones sobre usuarios.json en Drive ─────────────────────────────

export async function loadUsuarios(): Promise<DriveUser[]> {
  try {
    const drive = getDrive();
    return (await readJson<DriveUser[]>(drive, ROOT_FOLDER_ID, USUARIOS_FILE)) ?? [];
  } catch {
    return [];
  }
}

export async function saveUsuarios(usuarios: DriveUser[]): Promise<void> {
  const drive = getDrive();
  await writeJson(drive, ROOT_FOLDER_ID, USUARIOS_FILE, usuarios);
}

export async function findUserByEmail(email: string): Promise<DriveUser | null> {
  const usuarios = await loadUsuarios();
  return usuarios.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function createUser(
  email: string,
  password: string,
  nombre: string,
  rol: DriveUser['rol'] = 'auditor'
): Promise<DriveUser> {
  const usuarios = await loadUsuarios();
  const existing = usuarios.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error('El correo ya está registrado.');

  const newUser: DriveUser = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    nombre,
    rol,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString().slice(0, 10),
    activo: true,
  };
  usuarios.push(newUser);
  await saveUsuarios(usuarios);
  return newUser;
}

// ── Nombre de la cookie ───────────────────────────────────────────────────

export { COOKIE_NAME };

// ── Inicializar admin por defecto si usuarios.json está vacío ─────────────

export async function ensureDefaultAdmin(): Promise<void> {
  try {
    const usuarios = await loadUsuarios();
    if (usuarios.length === 0) {
      await createUser(
        'egarcerant@dusakawiepsi.com',
        'Wanoseshas2015.',
        'Eduardo Garcerant',
        'superadmin'
      );
    }
  } catch {
    // Si Drive no está disponible, continuar sin crear admin por defecto
  }
}
