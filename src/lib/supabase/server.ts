// Supabase deshabilitado — la app usa exclusivamente Google Drive (auth-drive.ts + gdrive.ts).
// Este módulo está bloqueado para evitar uso accidental.

export function createSupabaseServerClient(): never {
  throw new Error('Supabase deshabilitado. Usar auth-drive.ts para autenticación.');
}

export function createSupabaseAdminClient(): never {
  throw new Error('Supabase deshabilitado. Usar gdrive.ts para acceso a datos.');
}
