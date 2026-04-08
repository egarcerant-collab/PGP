import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export interface NtUpdateRow {
  cup: string;
  descripcion: string;
  valorUnitario: number;
  costoEventoMes: number;
}

export interface NtUpdatePayload {
  spreadsheetUrl: string;
  prestadorName: string;
  rows: NtUpdateRow[];
  numMeses: number;
}

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no está configurado en las variables de entorno');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

const TAB_NAME = 'CUPS Inesperadas';
const HEADERS = ['CUPS', 'DESCRIPCION CUPS', 'VALOR UNITARIO', 'COSTO EVENTO MES'];

export async function POST(req: NextRequest) {
  try {
    const body: NtUpdatePayload = await req.json();
    const { spreadsheetUrl, prestadorName, rows, numMeses } = body;

    // Validate input
    if (!spreadsheetUrl) return NextResponse.json({ error: 'URL del sheet requerida' }, { status: 400 });
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'No hay CUPS para enviar' }, { status: 400 });

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) return NextResponse.json({ error: 'URL del sheet inválida — no se encontró el ID del spreadsheet' }, { status: 400 });

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Check if tab exists, create it if not
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheet = spreadsheet.data.sheets?.find(
      s => s.properties?.title === TAB_NAME
    );

    if (existingSheet) {
      // Clear existing content
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${TAB_NAME}'`,
      });
    } else {
      // Create the tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: TAB_NAME }
            }
          }]
        }
      });
    }

    // Prepare data rows
    const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const metaRow = [`Actualizado: ${now} | Prestador: ${prestadorName} | Meses: ${numMeses} | CUPS: ${rows.length}`];
    const dataRows = rows.map(r => [
      r.cup,
      r.descripcion,
      r.valorUnitario,
      r.costoEventoMes,
    ]);

    const values = [
      metaRow,
      HEADERS,
      ...dataRows,
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${TAB_NAME}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    // Format header row (bold, background)
    const sheetId = existingSheet?.properties?.sheetId
      ?? spreadsheet.data.sheets?.find(s => s.properties?.title === TAB_NAME)?.properties?.sheetId
      ?? 0;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Bold header row (row index 1 = second row = HEADERS)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.133, green: 0.369, blue: 0.675 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            }
          },
          // Auto-resize columns
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 4 }
            }
          }
        ]
      }
    });

    return NextResponse.json({
      success: true,
      message: `${rows.length} CUPS enviados exitosamente a la pestaña "${TAB_NAME}" de la Nota Técnica de ${prestadorName}`,
      rowsWritten: rows.length,
      tab: TAB_NAME,
    });

  } catch (error: any) {
    console.error('Error updating NT sheet:', error);

    // Provide helpful error messages
    if (error.message?.includes('GOOGLE_SERVICE_ACCOUNT_JSON')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error.code === 403 || error.message?.includes('permission') || error.message?.includes('Permission')) {
      return NextResponse.json({
        error: `Sin permisos para editar este Sheet. Asegúrate de compartir el Google Sheet con el correo de la cuenta de servicio como Editor.`
      }, { status: 403 });
    }
    if (error.code === 404) {
      return NextResponse.json({ error: 'Spreadsheet no encontrado. Verifica que la URL del Sheet sea correcta.' }, { status: 404 });
    }

    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
