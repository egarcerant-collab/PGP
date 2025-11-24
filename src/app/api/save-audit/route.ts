
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Helper function to sanitize filenames
const sanitizeFilename = (name: string) => {
    return name.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { auditData, prestadorName, month } = body;

    if (!auditData || !prestadorName || !month) {
      return NextResponse.json({ message: 'Faltan datos requeridos (auditData, prestadorName, month).' }, { status: 400 });
    }

    // Sanitize inputs to create safe directory and file names
    const sanitizedMonth = sanitizeFilename(month);
    const sanitizedPrestadorName = sanitizeFilename(prestadorName);
    
    // Define the path: public/informes/<mes>/<prestador>.json
    const reportsDir = path.join(process.cwd(), 'public', 'informes');
    const monthDir = path.join(reportsDir, sanitizedMonth);
    const filePath = path.join(monthDir, `${sanitizedPrestadorName}.json`);

    // Ensure the directory exists, creating it if necessary
    await fs.mkdir(monthDir, { recursive: true });

    // Write the audit data to the file, overwriting if it exists
    await fs.writeFile(filePath, JSON.stringify(auditData, null, 2));

    return NextResponse.json({ message: `Auditoría para ${prestadorName} en ${month} guardada exitosamente.` }, { status: 200 });

  } catch (error) {
    console.error('Error al guardar el archivo de auditoría:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido en el servidor.';
    
    return NextResponse.json({ message: 'Error interno del servidor al guardar el archivo.', error: errorMessage }, { status: 500 });
  }
}
