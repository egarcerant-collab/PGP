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
 * Busca NT para un mes usando 3 estrategias en cascada:
 * 1. Match por NIT (9 dígitos, sin dígito de verificación)
 * 2. Match por nombre del prestador (si se pasa prestadorName)
 * 3. Wildcard (config con NIT vacío)
 */
export function getNtForMonth(
  configs: NtConfigEntry[],
  nit: string,
  mes: string,
  vigencia: number,
  fallback: number,
  prestadorName?: string,
): number {
  const mesIdx = monthIndex(mes);
  if (mesIdx === -1) return fallback;

  const nitClean = nit.replace(/\D/g, '').slice(0, 9);
  const nameClean = (prestadorName || '').toUpperCase().trim();

  const inRange = (c: NtConfigEntry) => {
    if (c.vigencia !== vigencia) return false;
    return mesIdx >= monthIndex(c.mesInicio) && mesIdx <= monthIndex(c.mesFin);
  };

  // 1. Match por NIT exacto (9 dígitos)
  if (nitClean) {
    const byNit = configs.find(c => {
      if (!inRange(c)) return false;
      return c.nit.replace(/\D/g, '').slice(0, 9) === nitClean;
    });
    if (byNit) return byNit.nt;
  }

  // 2. Match por nombre de prestador
  if (nameClean.length >= 4) {
    const byName = configs.find(c => {
      if (!inRange(c)) return false;
      const cP = (c.prestador || '').toUpperCase().trim();
      if (cP.length < 4) return false;
      const prefix = cP.slice(0, Math.min(cP.length, 10));
      return nameClean.includes(prefix) || cP.includes(nameClean.slice(0, Math.min(nameClean.length, 10)));
    });
    if (byName) return byName.nt;
  }

  // 3. Wildcard (nit vacío en config)
  const byWild = configs.find(c => inRange(c) && !c.nit.replace(/\D/g, ''));
  if (byWild) return byWild.nt;

  return fallback;
}

/**
 * Suma NT mensual para un grupo de meses usando overrides.
 * Acepta prestadorName para matching por nombre como fallback.
 */
export function getNtPeriodo(
  configs: NtConfigEntry[],
  nit: string,
  monthNames: string[],
  vigencia: number,
  monthlyNTFallback: number,
  prestadorName?: string,
): number {
  return monthNames.reduce(
    (sum, mes) => sum + getNtForMonth(configs, nit, mes, vigencia, monthlyNTFallback, prestadorName),
    0,
  );
}

export const MONTH_NAMES = MONTHS;
