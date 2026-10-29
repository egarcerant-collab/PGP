export function calcularGlosa(rows: Array<{ CUPS: string; Valor_Ejecutado: number; Valor_Unitario: number; Cantidad_Ejecutada: number }>, quantities: Record<string, number>) {
  return rows.reduce((sum, row) => sum + Math.max(0,
    row.Valor_Ejecutado - (quantities[row.CUPS] ?? row.Cantidad_Ejecutada) * row.Valor_Unitario
  ), 0);
}

export function resolverGlosa(calculada: number, tieneDetalle: boolean, guardada?: number) {
  return tieneDetalle ? calculada : (guardada ?? calculada);
}

export function descuentoGuardado(informe: Record<string, any>, fallback: number) {
  return Number(informe.descontar ?? informe.pdfData?.descontar ?? fallback);
}

export function glosaGuardada(informe: Record<string, any>): number | null {
  const pd = informe.pdfData ?? informe.pdf_data ?? {};
  if (pd.glosaAuditoria !== undefined) return Number(pd.glosaAuditoria);
  const descuento = informe.descontar ?? pd.descontar;
  const ejecutado = informe.totalEjecutado ?? informe.total_ejecutado ?? pd.totalEjecutadoFinal;
  if (descuento === undefined || ejecutado === undefined || pd.minPeriodo === undefined) return null;
  return Math.max(0, Number(descuento) - Math.max(0, Number(pd.minPeriodo) - Number(ejecutado)));
}

export function contenidoGlosas(glosa: number, comments: Record<string, string> = {}) {
  const entries = Object.entries(comments).filter(([, comment]) => comment.trim());
  if (!glosa && !entries.length) return [];
  return [
    { text: 'GLOSAS DE AUDITORÍA', bold: true, fontSize: 9, margin: [0, 10, 0, 4] },
    { text: `Valor glosado: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(glosa)}`, fontSize: 8, bold: true, margin: [0, 0, 0, 5] },
    ...entries.map(([cups, comment]) => ({ text: `CUPS ${cups}: ${comment}`, fontSize: 8, margin: [0, 0, 0, 5] })),
  ];
}

export function actualizarGlosa(informe: Record<string, any>, glosa: number) {
  if (!Number.isFinite(glosa) || glosa < 0) throw new Error('Glosa inválida');
  const pd = informe.pdf_data || {};
  const ejecutado = Number(informe.total_ejecutado ?? pd.totalEjecutadoFinal ?? 0);
  const minimo = Number(pd.minPeriodo ?? Number(informe.nt_periodo || 0) * 0.9);
  const descontar = Math.max(0, minimo - ejecutado) + glosa;
  const valorFinal = Number(pd.ntPeriodo ?? informe.nt_periodo ?? 0) - descontar + Number(informe.reconocer ?? pd.reconocer ?? 0);
  return {
    descontar,
    valor_final: valorFinal,
    pdf_data: { ...pd, glosaAuditoria: glosa, descontar, valorFinal },
  };
}
