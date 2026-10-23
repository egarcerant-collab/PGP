export function descuentoGuardado(informe: Record<string, any>, fallback: number) {
  return Number(informe.descontar ?? informe.pdfData?.descontar ?? fallback);
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
