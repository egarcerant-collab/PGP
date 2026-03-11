
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
}

interface BuildMatrizArgs {
  executionDataByMonth: ExecutionDataByMonth;
  pgpData: PgpRow[];
}

export const findColumnValue = (row: PgpRow, possibleNames: string[]): any => {
  if (!row) return undefined;
  const keys = Object.keys(row);
  for (const name of possibleNames) {
    const key = keys.find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
    if (key && row[key] !== undefined) return row[key];
  }
  return undefined;
};


export function buildMatrizEjecucion({ executionDataByMonth, pgpData }: BuildMatrizArgs): MatrizRow[] {
  const matriz: MatrizRow[] = [];
  
  const pgpCupsMap = new Map<string, PgpRow>();
  pgpData.forEach(row => {
      const cup = findColumnValue(row, ['cup/cum', 'cups', 'id resolucion 3100', 'código']);
      if(cup) pgpCupsMap.set(String(cup).trim().toUpperCase(), row);
  });

  const getMonthName = (monthNumber: string) => {
    const date = new Date(2024, parseInt(monthNumber) - 1, 1);
    const name = date.toLocaleString('es-CO', { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  executionDataByMonth.forEach((monthData, monthKey) => {
    const monthName = getMonthName(monthKey);
    const allCupsForMonth = new Set([...pgpCupsMap.keys(), ...Array.from(monthData.cupCounts.keys()).map(c => c.trim().toUpperCase())]);

    allCupsForMonth.forEach(cup => {
      const pgpRow = pgpCupsMap.get(cup);
      const monthCupData = monthData.cupCounts.get(cup) || monthData.cupCounts.get(cup.toLowerCase());

      const cantidadEsperada = pgpRow ? getNumericValue(findColumnValue(pgpRow, ['frecuencia eventos mes', 'frecuencia'])) : 0;
      const cantidadEjecutada = monthCupData?.total || 0;
      
      const valorEsperado = pgpRow ? getNumericValue(findColumnValue(pgpRow, ['costo evento mes (valor mes)', 'costo evento mes', 'valor total'])) : 0;
      const unitValue = pgpRow ? getNumericValue(findColumnValue(pgpRow, ['valor unitario', 'vr unitario'])) : 0;

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

      // Priorizar nombres de columna que suelen estar en la posición F (Descripción)
      const descripcion = findColumnValue(pgpRow, ['descripcion cups', 'descripcion id resolucion', 'descripcion', 'nombre del servicio']);

      matriz.push({
        Mes: monthName,
        CUPS: cup,
        Descripcion: descripcion,
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
      });
    });
  });

  matriz.sort((a, b) => b.percentage_ejecucion - a.percentage_ejecucion);

  return matriz;
}
