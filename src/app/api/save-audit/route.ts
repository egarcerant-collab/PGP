
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

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
    
    const rootDir = process.cwd();
    const reportsDir = path.join(rootDir, 'public', 'informes');
    const monthDir = path.join(reportsDir, sanitizedMonth);
    const filePath = path.join(monthDir, `${sanitizedPrestadorName}.json`);

    try {
        await fs.mkdir(monthDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(auditData, null, 2), 'utf-8');
    } catch (fsError: any) {
        console.error('File System Error:', fsError);
        return NextResponse.json({ 
            message: 'Error al escribir en el disco del servidor.',
            error: fsError.message,
            code: fsError.code
        }, { status: 500 });
    }

    return NextResponse.json({ 
        message: `Archivo guardado exitosamente.`,
        path: `/informes/${sanitizedMonth}/${sanitizedPrestadorName}.json`
    }, { status: 200 });

  } catch (error: any) {
    console.error('General API Error:', error);
    return NextResponse.json({ 
        message: 'Error interno en la API de guardado.',
        error: error.message 
    }, { status: 500 });
  }
}
