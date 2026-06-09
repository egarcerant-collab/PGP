/**
 * setup-drive-auth.mjs
 * Autenticación Google Drive con tu cuenta personal (OAuth2).
 * Ejecutar UNA sola vez: node scripts/setup-drive-auth.mjs
 * Guarda GOOGLE_OAUTH_REFRESH_TOKEN en .env.local automáticamente.
 */

import { google } from 'googleapis';
import { createServer } from 'http';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env.local');

// ── Credenciales OAuth2 de la app (lectura/escritura Drive) ──────────────
// Estas son credenciales públicas de tipo "Desktop App" — no son secretos de producción.
// Para usar las tuyas: Google Cloud Console > APIs > Credenciales > OAuth2 > Desktop App
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI  = 'http://localhost:9876/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.log('\n⚠️  Necesitas crear credenciales OAuth2 en Google Cloud Console.');
  console.log('\nPasos:');
  console.log('  1. Ve a: https://console.cloud.google.com/apis/credentials');
  console.log('  2. Crear credenciales → ID de cliente OAuth 2.0');
  console.log('  3. Tipo de aplicación: "Aplicación de escritorio"');
  console.log('  4. Descarga el JSON o copia Client ID y Client Secret');
  console.log('  5. Ejecuta:');
  console.log('     GOOGLE_CLIENT_ID=tu_id GOOGLE_CLIENT_SECRET=tu_secret node scripts/setup-drive-auth.mjs\n');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n🔑 Abriendo navegador para autorizar Google Drive...\n');
const openCmd = process.platform === 'win32' ? `start "${authUrl}"` : `xdg-open "${authUrl}"`;
exec(openCmd);

// Servidor local para capturar el código de autorización
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:9876');
  if (url.pathname !== '/callback') {
    res.end('Esperando callback...');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('Error: no se recibió código de autorización.');
    server.close();
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      res.writeHead(400);
      res.end('Error: no se recibió refresh_token. Intenta de nuevo.');
      server.close();
      return;
    }

    // Leer .env.local actual y agregar/actualizar las variables
    let envContent = '';
    try { envContent = readFileSync(ENV_PATH, 'utf-8'); } catch {}

    const lines = envContent.split('\n').filter(l =>
      !l.startsWith('GOOGLE_CLIENT_ID=') &&
      !l.startsWith('GOOGLE_CLIENT_SECRET=') &&
      !l.startsWith('GOOGLE_OAUTH_REFRESH_TOKEN=')
    );

    lines.push(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    lines.push(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    lines.push(`GOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}`);

    writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#4CAF50">✅ ¡Autorización exitosa!</h2>
        <p>Tu refresh token fue guardado en <code>.env.local</code></p>
        <p>Reinicia el servidor: <code>npm run dev</code></p>
        <p style="color:#888">Puedes cerrar esta pestaña.</p>
      </body></html>
    `);

    console.log('\n✅ Refresh token guardado en .env.local');
    console.log('   Reinicia el servidor con: npm run dev\n');

    server.close();
  } catch (err) {
    res.writeHead(500);
    res.end('Error al obtener tokens: ' + err.message);
    server.close();
  }
});

server.listen(9876, () => {
  console.log('Esperando autorización en http://localhost:9876/callback ...');
  console.log('(Si el navegador no abrió automáticamente, copia esta URL:)');
  console.log(authUrl + '\n');
});
