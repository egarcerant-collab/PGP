
import type { ExecutionDataByMonth, CupCountsMap } from "@/app/page";
import { getNumericValue } from "@/components/app/JsonAnalyzerPage";

interface PgpRow {
  [key: string]: any;
}

export interface MatrizRow {
  Mes: string;
  CUPS: string;
  Descripcion?: string;
  Diagnostico_Principal?: string;
  Cantidad_Esperada: number;
  Cantidad_Ejecutada: number;
  Diferencia: number;
  percentage_ejecucion: number; 
  '%_Ejecucion': string;
  Clasificacion: string;
  Valor_Unitario: number;
  Valor_Esperado: number;
  Valor_Ejecutado: number;
  Tipo_Servicio: "Consulta" | "Procedimiento" | "Medicamento" | "Otro Servicio";
}

interface BuildMatrizArgs {
  executionDataByMonth: ExecutionDataByMonth;
  pgpData: PgpRow[];
}

/**
 * Busca un valor en una fila intentando coincidir con varios nombres posibles de columna.
 */
export const findColumnValue = (row: PgpRow, possibleNames: string[]): any => {
  if (!row) return undefined;
  const keys = Object.keys(row);
  
  // 1. Intento por coincidencia exacta (normalizada)
  for (const name of possibleNames) {
    const target = name.toLowerCase().trim();
    const key = keys.find(k => k.toLowerCase().trim() === target);
    if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  
  // 2. Intento por coincidencia parcial (si la columna contiene la palabra clave)
  for (const name of possibleNames) {
    const target = name.toLowerCase().trim();
    const key = keys.find(k => k.toLowerCase().includes(target));
    if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  
  return undefined;
};

/**
 * Determina el tipo de servicio basado en el código CUPS.
 */
const guessServiceTypeByCup = (cup: string): "Consulta" | "Procedimiento" | "Medicamento" | "Otro Servicio" => {
    const code = String(cup).trim().toUpperCase();
    
    // Consultas y servicios relacionados (89, 86, 94 para Psicoterapias/Consultas)
    if (code.startsWith('89') || code.startsWith('86') || code.startsWith('94') || code.startsWith('99')) return "Consulta";
    
    // Procedimientos y Terapias (90-98, I30...)
    if (
        code.startsWith('90') || code.startsWith('87') || code.startsWith('88') || 
        code.startsWith('91') || code.startsWith('92') || code.startsWith('93') || 
        code.startsWith('95') || code.startsWith('96') || code.startsWith('97') || 
        code.startsWith('98') || code.startsWith('I')
    ) {
        return "Procedimiento";
    }
    
    // Medicamentos
    if (code.length >= 6 && /[A-Z]/.test(code) && !code.startsWith('I')) return "Medicamento";
    
    return "Procedimiento";
};

export function buildMatrizEjecucion({ executionDataByMonth, pgpData }: BuildMatrizArgs): MatrizRow[] {
  const matriz: MatrizRow[] = [];
  
  const pgpCupsMap = new Map<string, PgpRow>();
  pgpData.forEach((row, i) => {
      const cup = findColumnValue(row, ['cups', 'cup/cum', 'id resolucion 3100', 'código', 'cup', 'codigo']);
      if(cup) pgpCupsMap.set(String(cup).trim().toUpperCase(), row);
      // Log columnas y valores completos de la primera fila para diagnóstico
      if (i === 0) {
        console.log('[NT columnas]', Object.keys(row));
        console.log('[NT primera fila]', JSON.stringify(row));
      }
  });

  const getMonthName = (monthNumber: string) => {
    const date = new Date(2024, parseInt(monthNumber) - 1, 1);
    const name = date.toLocaleString('es-CO', { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  executionDataByMonth.forEach((monthData, monthKey) => {
    const monthName = getMonthName(monthKey);
    const allCupsForMonth = new Set([
        ...pgpCupsMap.keys(), 
        ...Array.from(monthData.cupCounts.keys()).map(c => c.trim().toUpperCase())
    ]);

    allCupsForMonth.forEach(cup => {
      const pgpRow = pgpCupsMap.get(cup);
      const monthCupData = monthData.cupCounts.get(cup) || monthData.cupCounts.get(cup.toLowerCase());

      const cantidadEsperada = pgpRow ? getNumericValue(findColumnValue(pgpRow, ['frecuencia eventos mes', 'frecuencia', 'frecuencia_mes'])) : 0;
      const unitValue = pgpRow ? getNumericValue(findColumnValue(pgpRow, ['valor', 'valor unitario', 'vr unitario', 'valor_unitario', 'costo'])) : 0;
      const valorEsperado = pgpRow ? getNumericValue(findColumnValue(pgpRow, ['costo evento mes (valor mes)', 'costo evento mes', 'valor total', 'valor_total'])) : (cantidadEsperada * unitValue);

      const cantidadEjecutada = monthCupData?.total || 0;
      const valorEjecutado = cantidadEjecutada * unitValue;
      
      if(cantidadEsperada === 0 && cantidadEjecutada === 0) return;

      const diferencia = cantidadEjecutada - cantidadEsperada;
      const percentage = cantidadEsperada > 0 ? (cantidadEjecutada / cantidadEsperada) * 100 : (cantidadEjecutada > 0 ? Infinity : 0);

      let clasificacion = "Ejecución Normal";
      if (!pgpRow && cantidadEjecutada > 0) clasificacion = "Inesperado";
      else if (cantidadEjecutada === 0 && cantidadEsperada > 0) clasificacion = "Faltante";
      else if (percentage > 111) clasificacion = "Sobre-ejecutado";
      else if (percentage < 90 && cantidadEsperada > 0) clasificacion = "Sub-ejecutado";

      let diagnosticoPrincipal: string | undefined = undefined;
      if (monthCupData && monthCupData.diagnoses.size > 0) {
        diagnosticoPrincipal = [...monthCupData.diagnoses.entries()].reduce((a, b) => a[1] > b[1] ? a : b)[0];
      }

      const serviceType = monthCupData?.type || guessServiceTypeByCup(cup);

      // REGLA: Medicamentos/Otros → JSON (nomTecnologiaSalud); Consultas/Procedimientos → Sheet; fallback cruzado
      let descripcion: string | undefined;

      if (serviceType === "Medicamento" || serviceType === "Otro Servicio") {
          // 1. JSON primero (nomTecnologiaSalud)
          descripcion = monthCupData?.jsonDescription;
          // 2. Sheet como fallback
          if (!descripcion && pgpRow) descripcion = findColumnValue(pgpRow, [
              'descripcion cups','descripcion id resolucion','descripcion','nombre','actividad','concepto','detalle','tecnologia','prestacion','servicio'
          ]);
      } else {
          // Consultas / Procedimientos: Sheet primero
          // Orden: columna exacta del NT de PROBIENESTAR → otros nombres conocidos → fallback
          if (pgpRow) {
              // Buscar en todas las columnas conocidas, priorizando las más específicas
              descripcion = findColumnValue(pgpRow, [
                  'descripcion cups',           // columna exacta (puede estar vacía)
                  'descripcion id resolucion',  // descripción del grupo Res.3100
                  'descripcion de la tecnologia',
                  'descripcion',
                  'descripción',
                  'nombre cups',
                  'nombre del servicio',
                  'nombre',
                  'actividad',
                  'prestacion',
                  'tecnologia',
                  'detalle',
                  'concepto',
                  'servicio',
              ]);
              // Si aún no hay descripción, combinar SUBCATEGORIA + AMBITO como referencia
              if (!descripcion) {
                  const sub = findColumnValue(pgpRow, ['subcategoria']);
                  const amb = findColumnValue(pgpRow, ['ambito']);
                  if (sub || amb) {
                      descripcion = [sub, amb].filter(Boolean).join(' · ');
                  }
              }
          }
          // Fallback inteligente: escanear TODAS las columnas del Sheet buscando texto largo
          // (NO excluir columnas con 'cups' en el nombre para atrapar "DESCRIPCION CUPS")
          if (!descripcion && pgpRow) {
              const IGNORAR_EXACTO = ['cups','nit','valor unitario','costo evento','frecuencia','vr unitario',
                  'valor minimo','valor maximo','costo evento dia','costo evento mes'];
              const keys = Object.keys(pgpRow);
              const sorted = [...keys].sort((a, b) => {
                  const aDesc = /desc|nomb|activ|prest|tecnol|servic|detall|concept|subcateg/i.test(a) ? -1 : 1;
                  const bDesc = /desc|nomb|activ|prest|tecnol|servic|detall|concept|subcateg/i.test(b) ? -1 : 1;
                  return aDesc - bDesc;
              });
              for (const key of sorted) {
                  const keyLow = key.toLowerCase().trim();
                  // Excluir solo columnas que son claramente numéricas o códigos puros
                  if (keyLow === 'cups' || keyLow === 'cup' || keyLow.match(/^_\d+$/)) continue;
                  if (IGNORAR_EXACTO.some(e => keyLow === e)) continue;
                  const val = pgpRow[key];
                  if (val && typeof val === 'string' && val.trim().length > 4 && isNaN(Number(val.trim()))) {
                      descripcion = val.trim();
                      break;
                  }
              }
          }
          // Último recurso: JSON
          if (!descripcion && monthCupData?.jsonDescription) {
              descripcion = monthCupData.jsonDescription;
          }
      }

      // Último recurso absoluto: si no hay nada, mostrar todas las columnas de texto del pgpRow
      if (!descripcion && pgpRow) {
        for (const key of Object.keys(pgpRow)) {
          if (key === 'CUPS' || key === 'cups' || /^_\d+$/.test(key)) continue;
          const v = pgpRow[key];
          if (v !== null && v !== undefined && String(v).trim().length > 3 && isNaN(Number(String(v).trim()))) {
            descripcion = String(v).trim();
            break;
          }
        }
      }

      matriz.push({
        Mes: monthName,
        CUPS: cup,
        Descripcion: descripcion || cup,
        Diagnostico_Principal: diagnosticoPrincipal,
        Cantidad_Esperada: cantidadEsperada,
        Cantidad_Ejecutada: cantidadEjecutada,
        Diferencia: diferencia,
        percentage_ejecucion: percentage,
        '%_Ejecucion': cantidadEsperada > 0 ? `${percentage.toFixed(0)}%` : 'N/A',
        Clasificacion: clasificacion,
        Valor_Unitario: unitValue,
        Valor_Esperado: valorEsperado,
        Valor_Ejecutado: valorEjecutado,
        Tipo_Servicio: serviceType
      });
    });
  });

  matriz.sort((a, b) => b.percentage_ejecucion - a.percentage_ejecucion);
  return matriz;
}
