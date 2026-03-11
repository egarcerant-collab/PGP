
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Helper function to sanitize filenames for the OS
const sanitizeFilename = (name: string) => {
    if (!name) return 'desconocido';
    return name.normalize('NFD')
               .replace(/[\u0300-\u036f]/g, '')
               .replace(/[^a-z0-9_.-]/gi, '_')
               .toLowerCase();
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { auditData, prestadorName, month } = body;

    if (!auditData || !prestadorName || !month) {
      return NextResponse.json({ message: 'Faltan datos requeridos.' }, { status: 400 });
    }

    const sanitizedMonth = sanitizeFilename(month);
    const sanitizedPrestadorName = sanitizeFilename(prestadorName);
    
    // Resolve path to public/informes/[mes]/[prestador].json
    const rootDir = process.cwd();
    const reportsDir = path.join(rootDir, 'public', 'informes');
    const monthDir = path.join(reportsDir, sanitizedMonth);
    const filePath = path.join(monthDir, `${sanitizedPrestadorName}.json`);

    // Ensure directory exists
    await fs.mkdir(monthDir, { recursive: true });

    // Write the full audit package to the JSON file
    await fs.writeFile(filePath, JSON.stringify(auditData, null, 2), 'utf-8');

    return NextResponse.json({ 
        message: `Archivo guardado en: public/informes/${sanitizedMonth}/${sanitizedPrestadorName}.json`,
        path: `/informes/${sanitizedMonth}/${sanitizedPrestadorName}.json`
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error saving to disk:', error);
    return NextResponse.json({ 
        message: 'Error al escribir en el servidor. Verifique permisos.',
        error: error.message 
    }, { status: 500 });
  }
}
