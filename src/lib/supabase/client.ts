// Supabase deshabilitado — la app usa exclusivamente Google Drive.
// Este módulo está bloqueado para evitar uso accidental.

export function createSupabaseClient(): never {
  throw new Error('Supabase deshabilitado. Usar gdrive.ts para acceso a datos.');
}
