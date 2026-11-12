export type NtConfigEntry = {
  id: string;
  nit: string;
  prestador: string;
  contrato?: string;
  mesInicio: string;
  mesFin: string;
  nt: number;
  vigencia: number;
  nota?: string;
};

const MONTHS = [
  'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
];

export function monthIndex(mes: string): number {
  return MONTHS.indexOf(mes.toUpperCase().trim());
}

/**
 * Dado un NIT, un mes (nombre en mayúsculas) y una vigencia, retorna el NT
 * mensual configurado para ese período. Si no hay configuración, retorna fallback.
 */
export function getNtForMonth(
  configs: NtConfigEntry[],
  nit: string,
  mes: string,
  vigencia: number,
  fallback: number,
): number {
  const mesIdx = monthIndex(mes);
  if (mesIdx === -1) return fallback;

  // Normalizar a los primeros 9 dígitos (NIT sin dígito de verificación)
  // Evita mismatch entre "9009869415" (con DV) y "900986941" (sin DV)
  const nitClean = nit.replace(/\D/g, '').slice(0, 9);
  const match = configs.find(c => {
    if (c.vigencia !== vigencia) return false;
    // Si el config no tiene NIT, aplica a cualquier prestador (wildcard)
    const cNit = c.nit.replace(/\D/g, '').slice(0, 9);
    if (cNit && cNit !== nitClean) return false;
    const start = monthIndex(c.mesInicio);
    const end = monthIndex(c.mesFin);
    return mesIdx >= start && mesIdx <= end;
  });

  return match ? match.nt : fallback;
}

/**
 * Dado un grupo de meses, retorna el NT total del período usando overrides.
 * Si para algún mes no hay override, usa monthlyNTFallback.
 */
export function getNtPeriodo(
  configs: NtConfigEntry[],
  nit: string,
  monthNames: string[],
  vigencia: number,
  monthlyNTFallback: number,
): number {
  return monthNames.reduce(
    (sum, mes) => sum + getNtForMonth(configs, nit, mes, vigencia, monthlyNTFallback),
    0,
  );
}

export const MONTH_NAMES = MONTHS;
