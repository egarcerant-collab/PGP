import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const REGISTRO_PATH = path.join(process.cwd(), 'public', 'informes', 'registro.json');

interface InformeRecord {
  numero: string;       // "001", "002"...
  prestador: string;
  nit: string;
  contrato: string;
  municipio: string;
  departamento: string;
  periodo: string;      // "ENERO-FEBRERO-MARZO"
  tipoPeriodo: string;  // "TRIMESTRAL", "BIMENSUAL", "MENSUAL"
  fecha: string;        // ISO date
  ntPeriodo: number;
  totalEjecutado: number;
  descontar: number;
  reconocer: number;
  valorFinal: number;
  totalAnticipos: number;
  responsable: string;
}

interface Registro {
  lastNumber: number;
  informes: InformeRecord[];
}

async function ensureDir() {
  await fs.mkdir(path.join(process.cwd(), 'public', 'informes'), { recursive: true });
}

async function leerRegistro(): Promise<Registro> {
  try {
    const raw = await fs.readFile(REGISTRO_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { lastNumber: 0, informes: [] };
  }
}

// GET /api/informes  — lista todos los informes guardados
export async function GET() {
  try {
    const registro = await leerRegistro();
    return NextResponse.json(registro);
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// POST /api/informes  — guarda un nuevo informe y devuelve el número asignado
export async function POST(request: Request) {
  try {
    const body = await request.json();
    await ensureDir();

    const registro = await leerRegistro();
    const nuevoNumero = registro.lastNumber + 1;
    const numeroFormateado = String(nuevoNumero).padStart(3, '0'); // "001", "002"...

    const nuevoInforme: InformeRecord = {
      numero: numeroFormateado,
      prestador: body.prestador || '',
      nit: body.nit || '',
      contrato: body.contrato || '',
      municipio: body.municipio || '',
      departamento: body.departamento || '',
      periodo: body.periodo || '',
      tipoPeriodo: body.tipoPeriodo || '',
      fecha: new Date().toISOString().slice(0, 10),
      ntPeriodo: body.ntPeriodo || 0,
      totalEjecutado: body.totalEjecutado || 0,
      descontar: body.descontar || 0,
      reconocer: body.reconocer || 0,
      valorFinal: body.valorFinal || 0,
      totalAnticipos: body.totalAnticipos || 0,
      responsable: body.responsable || '',
    };

    registro.lastNumber = nuevoNumero;
    registro.informes.unshift(nuevoInforme); // más recientes primero

    await fs.writeFile(REGISTRO_PATH, JSON.stringify(registro, null, 2), 'utf-8');

    return NextResponse.json({ success: true, numero: numeroFormateado, informe: nuevoInforme });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

// DELETE /api/informes?numero=001  — elimina un informe por número
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const numero = searchParams.get('numero');
    if (!numero) return NextResponse.json({ message: 'Falta número' }, { status: 400 });

    const registro = await leerRegistro();
    registro.informes = registro.informes.filter(i => i.numero !== numero);
    await fs.writeFile(REGISTRO_PATH, JSON.stringify(registro, null, 2), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
