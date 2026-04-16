"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileText, Loader2, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { MonthlyFinancialSummary } from "../pgp-search/FinancialMatrix";
import type { Prestador } from "../pgp-search/PgPsearchForm";
import { CIUDAD_DEPARTAMENTO, parseCurrencyField } from "@/lib/sheets";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((pdfFonts as any).pdfMake && pdfMake.vfs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfMake.vfs = (pdfFonts as any).pdfMake.vfs;
}

type PeriodType = 'trimestral' | 'bimensual' | 'mensual';

interface CertificadoTrimestralProps {
  comparisonSummary: { monthlyFinancials: MonthlyFinancialSummary[] } | null;
  pgpData: { notaTecnica: { valor3m: number } } | null;
  selectedPrestador: Prestador | null;
  executionDataByMonth: Map<string, { totalRealValue: number; uniqueCupCount?: number; totalCups?: number }>;
  onSaveAudit?: () => Promise<void>;
  userName?: string;
  initialResponsable?: string;
}

const MONTH_ES: Record<string, string> = {
  'Enero': 'ENERO', 'Febrero': 'FEBRERO', 'Marzo': 'MARZO',
  'Abril': 'ABRIL', 'Mayo': 'MAYO', 'Junio': 'JUNIO',
  'Julio': 'JULIO', 'Agosto': 'AGOSTO', 'Septiembre': 'SEPTIEMBRE',
  'Octubre': 'OCTUBRE', 'Noviembre': 'NOVIEMBRE', 'Diciembre': 'DICIEMBRE',
  'January': 'ENERO', 'February': 'FEBRERO', 'March': 'MARZO',
  'April': 'ABRIL', 'May': 'MAYO', 'June': 'JUNIO',
  'July': 'JULIO', 'August': 'AGOSTO', 'September': 'SEPTIEMBRE',
  'October': 'OCTUBRE', 'November': 'NOVIEMBRE', 'December': 'DICIEMBRE',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat('es-CO').format(Math.round(n));

/** Dibuja una gráfica de barras simple y devuelve base64 PNG */
function drawBarChart(
  labels: string[], values: number[], color: string, W = 490, H = 175
): string {
  if (typeof window === 'undefined') return '';
  const SCALE = 3;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const maxVal = Math.max(...values, 1);
  const n = labels.length;
  const padL = 8, padR = 8, padTop = 24, padBot = 34;
  const cW = W - padL - padR, cH = H - padTop - padBot;
  const gap = 10, bW = Math.max(12, (cW - gap * (n + 1)) / n);

  for (let g = 0; g <= 4; g++) {
    const gy = padTop + (cH / 4) * g;
    ctx.strokeStyle = g === 4 ? '#9ca3af' : '#e5e7eb';
    ctx.lineWidth = g === 4 ? 0.8 : 0.5;
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
  }

  labels.forEach((label, i) => {
    const x = padL + gap + i * (bW + gap);
    const bH = Math.max(2, (values[i] / maxVal) * cH);
    const y = padTop + cH - bH;
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(x + 2, y + 2, bW, bH);
    const grad = ctx.createLinearGradient(x, y, x, y + bH);
    grad.addColorStop(0, color); grad.addColorStop(1, color + 'aa');
    ctx.fillStyle = grad; ctx.fillRect(x, y, bW, bH);
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bW, y); ctx.stroke();
    const v = values[i] >= 1_000_000 ? `$${(values[i] / 1_000_000).toFixed(2)}M`
      : values[i] >= 1_000 ? `$${(values[i] / 1_000).toFixed(0)}k` : String(Math.round(values[i]));
    ctx.fillStyle = '#111827'; ctx.font = 'bold 7.5px Arial'; ctx.textAlign = 'center';
    ctx.fillText(v, x + bW / 2, y - 5);
    ctx.fillStyle = '#374151'; ctx.font = 'bold 8px Arial';
    ctx.fillText(label.substring(0, 3).toUpperCase(), x + bW / 2, padTop + cH + 14);
    ctx.fillStyle = '#6b7280'; ctx.font = '6.5px Arial';
    ctx.fillText(label.substring(0, 7), x + bW / 2, padTop + cH + 24);
  });
  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Gráfica de barras apiladas: base (color primario) + inesperadas (naranja).
 * `extra` = total inesperadas (se divide entre meses).
 * `isCurrency` = true → etiqueta con "$M/k", false → número entero
 * `baseColor` → color hex del segmento base
 */
function drawStackedBarChart(
  labels: string[], base: number[], extra: number,
  W = 490, H = 175, isCurrency = true, baseColor = '#1d4ed8'
): string {
  if (typeof window === 'undefined') return '';
  const SCALE = 3;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const extraPerBar = base.length > 0 ? extra / base.length : 0;
  const totals = base.map(v => v + extraPerBar);
  const maxVal = Math.max(...totals, 1);
  const n = labels.length;
  const padL = 8, padR = 8, padTop = 28, padBot = 46;
  const cW = W - padL - padR, cH = H - padTop - padBot;
  const gap = 10, bW = Math.max(12, (cW - gap * (n + 1)) / n);

  // Líneas de referencia
  for (let g = 0; g <= 4; g++) {
    const gy = padTop + (cH / 4) * g;
    ctx.strokeStyle = g === 4 ? '#9ca3af' : '#e5e7eb';
    ctx.lineWidth = g === 4 ? 0.8 : 0.5;
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
  }

  labels.forEach((label, i) => {
    const x = padL + gap + i * (bW + gap);
    const baseH  = Math.max(2, (base[i] / maxVal) * cH);
    const extraH = Math.max(0, (extraPerBar / maxVal) * cH);
    const totalH = baseH + extraH;
    const baseY  = padTop + cH - baseH;
    const extraY = baseY - extraH;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(x + 2, extraY + 2, bW, totalH);

    // Segmento base
    const grad = ctx.createLinearGradient(x, baseY, x, baseY + baseH);
    grad.addColorStop(0, baseColor); grad.addColorStop(1, baseColor + 'aa');
    ctx.fillStyle = grad; ctx.fillRect(x, baseY, bW, baseH);

    // Segmento inesperadas (naranja) — solo si hay extra
    if (extraPerBar > 0) {
      const gradE = ctx.createLinearGradient(x, extraY, x, extraY + extraH);
      gradE.addColorStop(0, '#f97316'); gradE.addColorStop(1, '#f97316cc');
      ctx.fillStyle = gradE; ctx.fillRect(x, extraY, bW, extraH);
      // línea separadora
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x + bW, baseY); ctx.stroke();
    }

    // Borde superior
    ctx.strokeStyle = extraPerBar > 0 ? '#f97316' : baseColor;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, extraY); ctx.lineTo(x + bW, extraY); ctx.stroke();

    // Etiqueta total (encima)
    const total = base[i] + extraPerBar;
    const v = isCurrency
      ? (total >= 1_000_000 ? `$${(total / 1_000_000).toFixed(2)}M`
        : total >= 1_000 ? `$${(total / 1_000).toFixed(0)}k` : String(Math.round(total)))
      : (total >= 1_000 ? `${(total / 1_000).toFixed(1)}k` : String(Math.round(total)));
    ctx.fillStyle = '#111827'; ctx.font = 'bold 7.5px Arial'; ctx.textAlign = 'center';
    ctx.fillText(v, x + bW / 2, extraY - 5);

    // Mes
    ctx.fillStyle = '#374151'; ctx.font = 'bold 8px Arial';
    ctx.fillText(label.substring(0, 3).toUpperCase(), x + bW / 2, padTop + cH + 14);
    ctx.fillStyle = '#6b7280'; ctx.font = '6.5px Arial';
    ctx.fillText(label.substring(0, 7), x + bW / 2, padTop + cH + 24);
  });

  // Leyenda en la parte inferior
  const legY = H - 10;
  ctx.fillStyle = baseColor; ctx.fillRect(padL, legY - 7, 10, 7);
  ctx.fillStyle = '#374151'; ctx.font = '6.5px Arial'; ctx.textAlign = 'left';
  ctx.fillText(isCurrency ? 'Ejecución CUPS (valor)' : 'Actividades CUPS', padL + 13, legY - 1);
  if (extraPerBar > 0) {
    ctx.fillStyle = '#f97316'; ctx.fillRect(padL + 130, legY - 7, 10, 7);
    ctx.fillStyle = '#374151';
    ctx.fillText(isCurrency ? 'CUPS / Tec. Inesperadas (valor)' : 'Actividades Inesperadas', padL + 143, legY - 1);
  }

  return canvas.toDataURL('image/png', 1.0);
}

export default function CertificadoTrimestral({
  comparisonSummary, pgpData, selectedPrestador, executionDataByMonth, onSaveAudit, userName, initialResponsable,
}: CertificadoTrimestralProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('trimestral');
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [informeNum, setInformeNum] = useState('');
  const [contrato, setContrato] = useState(selectedPrestador?.CONTRATO || '');
  const [responsable, setResponsable] = useState(
    initialResponsable ? initialResponsable.toUpperCase() : (userName ? userName.toUpperCase() : '')
  );
  const [supervisorName, setSupervisorName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNum, setSavedNum] = useState<string | null>(null);
  const [isSavingAudit, setIsSavingAudit] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [deletingNum, setDeletingNum] = useState<string | null>(null);
  const [viewingInf, setViewingInf] = useState<any | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [viewPwInput, setViewPwInput] = useState('');
  const [viewPwError, setViewPwError] = useState(false);
  const [viewUnlocked, setViewUnlocked] = useState(false);
  const [notaAdicional, setNotaAdicional] = useState('');
  const [notaEjecucionFinanciera, setNotaEjecucionFinanciera] = useState('');
  const [valorCupsInesperadas, setValorCupsInesperadas] = useState(0);
  const [cantidadCupsInesperadas, setCantidadCupsInesperadas] = useState<string>('');
  const { toast } = useToast();

  // Actualiza el responsable cuando se carga una auditoría de otro auditor
  useEffect(() => {
    if (initialResponsable) {
      setResponsable(initialResponsable.toUpperCase());
    }
  }, [initialResponsable]);

  // Carga el valor y la cantidad de CUPS Inesperadas guardados (módulo CUPS o entrada manual)
  useEffect(() => {
    const prestKey = selectedPrestador?.PRESTADOR?.replace(/\s+/g, '_') || 'default';
    const valKey  = `pgp-cups-inesperadas-manual-${prestKey}`;
    const cantKey = `pgp-cups-inesperadas-cantidad-${prestKey}`;
    const savedVal  = localStorage.getItem(valKey);
    const savedCant = localStorage.getItem(cantKey);
    setValorCupsInesperadas(savedVal && !isNaN(Number(savedVal)) && Number(savedVal) > 0 ? Number(savedVal) : 0);
    setCantidadCupsInesperadas(savedCant || '');
  }, [selectedPrestador]);

  const handleSaveCantidad = (val: string) => {
    setCantidadCupsInesperadas(val);
    const prestKey = selectedPrestador?.PRESTADOR?.replace(/\s+/g, '_') || 'default';
    localStorage.setItem(`pgp-cups-inesperadas-cantidad-${prestKey}`, val);
  };

  // Carga siguiente número disponible al montar
  useEffect(() => {
    fetch('/api/informes')
      .then(r => r.json())
      .then(d => {
        const next = String((d.lastNumber || 0) + 1).padStart(3, '0');
        setInformeNum(next);
      })
      .catch(() => {});
  }, []);

  const loadHistorial = async () => {
    setLoadingHistorial(true);
    try {
      const r = await fetch('/api/informes');
      const d = await r.json();
      setHistorial(d.informes || []);
    } finally {
      setLoadingHistorial(false);
    }
  };

  // Auto-carga el registro al montar el componente
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadHistorial(); }, []);

  const handleDeleteConfirm = async () => {
    if (pwInput !== '123456') {
      setPwError(true);
      return;
    }
    if (!deletingNum) return;
    try {
      await fetch(`/api/informes?numero=${deletingNum}`, { method: 'DELETE' });
      toast({ title: `Informe N° ${deletingNum} eliminado` });
      setHistorial(prev => prev.filter(i => i.numero !== deletingNum));
      // Recalcular siguiente número
      const r = await fetch('/api/informes');
      const d = await r.json();
      const next = String((d.lastNumber || 0) + 1).padStart(3, '0');
      setInformeNum(next);
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    } finally {
      setDeletingNum(null);
      setPwInput('');
      setPwError(false);
    }
  };

  const months = useMemo(() => comparisonSummary?.monthlyFinancials || [], [comparisonSummary]);
  const periodSize = periodType === 'trimestral' ? 3 : periodType === 'bimensual' ? 2 : 1;

  const periodGroups = useMemo(() => {
    const groups: { label: string; months: MonthlyFinancialSummary[] }[] = [];
    for (let i = 0; i + periodSize <= months.length; i += periodSize) {
      const slice = months.slice(i, i + periodSize);
      groups.push({ label: slice.map(m => MONTH_ES[m.month] || m.month.toUpperCase()).join('-'), months: slice });
    }
    const rem = months.length % periodSize;
    if (rem > 0) {
      const slice = months.slice(months.length - rem);
      const label = slice.map(m => MONTH_ES[m.month] || m.month.toUpperCase()).join('-');
      if (!groups.find(g => g.label === label)) groups.push({ label, months: slice });
    }
    return groups;
  }, [months, periodSize]);

  const selectedGroup = periodGroups[selectedPeriodIndex] ?? periodGroups[0];

  const handleGenerate = async () => {
    if (!selectedGroup || !pgpData || !selectedPrestador) return;
    setIsGenerating(true);
    toast({ title: 'Generando certificado...', description: 'Construyendo el documento.' });
    try {
      const n = selectedGroup.months.length;

      // ── Datos del Sheet de prestadores ──
      // VALOR CONTRATO, FRANJA INFERIOR y FRANJA SUPERIOR son valores MENSUALES
      // (UPC × población del periodo). MESES indica duración del contrato (12, 11…)
      const valorContratoMensual = parseCurrencyField(selectedPrestador['VALOR CONTRATO']);
      const franjaInf90Mensual   = parseCurrencyField(selectedPrestador['FRANJA DE RIESGO INFERIOR (90%)']);
      const franjaSup110Mensual  = parseCurrencyField(selectedPrestador['FRANJA DE RIESGO SUPERIOR (110%)']);
      const fechaInicio          = String(selectedPrestador['FECHA INICIO DE CONTRATO'] || '01/01/2025').trim();
      const fechaFin             = String(selectedPrestador['FECHA FIN DE CONTRATO']   || '31/12/2025').trim();

      // NT mensual: usa Sheet si existe; si no, usa el valor calculado desde la NT
      // pgpData.notaTecnica.valor3m = suma de 'costo evento mes' = valor mensual
      const monthlyNT = valorContratoMensual > 0
        ? valorContratoMensual
        : pgpData.notaTecnica.valor3m; // ya es mensual

      const ntPeriodo = monthlyNT * n;

      // Franjas del periodo = franja mensual × número de meses del periodo
      const minPeriodo = franjaInf90Mensual > 0
        ? franjaInf90Mensual * n
        : ntPeriodo * 0.9;
      const maxPeriodo = franjaSup110Mensual > 0
        ? franjaSup110Mensual * n
        : ntPeriodo * 1.1;

      const adv80 = monthlyNT * 0.8;

      // Para TRIMESTRAL: los meses cargados son anticipos (80% c/u),
      // el pago de liquidación ocurre en el mes de cierre del trimestre
      // Para BIMENSUAL o MENSUAL: sólo el primer mes es anticipo
      const expectedMonths = periodType === 'trimestral' ? 3 : periodType === 'bimensual' ? 2 : 1;
      const ntPeriodoFull = monthlyNT * expectedMonths;          // NT del periodo completo
      const advanceMonths = periodType === 'trimestral' ? n      // todos los meses cargados son anticipo
                          : periodType === 'bimensual'  ? Math.max(0, n - 1)
                          : 0;
      const totalAdv = adv80 * advanceMonths;
      const lastMonthPay = ntPeriodoFull - totalAdv;            // saldo de liquidación

      // ── Actividades por mes: suma de Cantidad_Ejecutada de todos los CUPS ──
      // Viene de comparisonSummary.monthlyFinancials.totalActividades (suma de Cant. Validada)
      const mesData = selectedGroup.months.map(m => ({
        name: MONTH_ES[m.month] || m.month.toUpperCase(),
        value: m.totalValorEjecutado,
        cups: m.totalActividades ?? 0, // total de actividades ejecutadas ese mes
      }));

      const empresa = String(selectedPrestador.PRESTADOR || '').trim();
      const nit = String(selectedPrestador.NIT || '').trim();
      const ciudadRaw = String(selectedPrestador.CIUDAD || (selectedPrestador as Record<string, string>)['MUNICIPIO'] || 'RIOHACHA').trim().toUpperCase();
      const municipio = ciudadRaw;
      // DEPARTAMENTO: usa el Sheet si existe, si no deriva de la ciudad
      const depto = String(
        selectedPrestador.DEPARTAMENTO ||
        (selectedPrestador as Record<string, string>)['DEPARTAMENTO'] ||
        CIUDAD_DEPARTAMENTO[ciudadRaw] ||
        'LA GUAJIRA'
      ).trim().toUpperCase();
      const periodoLabel = periodType === 'trimestral' ? 'TRIMESTRE' : periodType === 'bimensual' ? 'BIMESTRE' : 'MES';
      const contratoNum = contrato || selectedPrestador.CONTRATO || 'N/A';
      const periodo = selectedGroup.label;

      // ── Gráficas ──
      const labels = mesData.map(m => m.name);
      const cantInespNum = parseInt(cantidadCupsInesperadas) || 0;
      // Chart 1: apilado (base + inesperadas) si hay valor de inesperadas
      const chart1 = valorCupsInesperadas > 0
        ? drawStackedBarChart(labels, mesData.map(m => m.value), valorCupsInesperadas)
        : drawBarChart(labels, mesData.map(m => m.value), '#1d4ed8');
      // Chart 2: apilado (conteo normal + actividades inesperadas) si hay cantidad
      const chart2 = cantInespNum > 0
        ? drawStackedBarChart(labels, mesData.map(m => m.cups), cantInespNum, 490, 175, false, '#15803d')
        : drawBarChart(labels, mesData.map(m => m.cups), '#15803d');

      // ── Narrativa entre gráficas (valores) ──
      const detalleValor = mesData.map((m, i) => {
        if (i === 0) return `En el mes de ${m.name}, se registró un total de ${fmtN(m.cups)} actividades asociadas a CUPS (Códigos Únicos en Salud), con un consolidado en costos equivalente a ${fmt(m.value)}.`;
        if (i === mesData.length - 1) return `Finalmente, en el mes de ${m.name}, la ejecución alcanzó ${fmtN(m.cups)} actividades, reflejando un costo acumulado de ${fmt(m.value)}.`;
        return `Durante el mes de ${m.name}, el comportamiento presentó una variación correspondiente a ${fmtN(m.cups)} actividades, para un total consolidado de ${fmt(m.value)}.`;
      }).join(' ');

      const totalEjecutado = mesData.reduce((a, m) => a + m.value, 0);
      const totalCups = mesData.reduce((a, m) => a + m.cups, 0);
      // Suma CUPS / Tecnologías Inesperadas al total ejecutado para el cálculo de bandas
      const totalEjecutadoFinal = totalEjecutado + valorCupsInesperadas;

      // ── Cálculo DESCONTAR / RECONOCER según ejecución real vs banda 90-110% ──
      const descontar = totalEjecutadoFinal < minPeriodo ? minPeriodo - totalEjecutadoFinal : 0;
      const reconocer = totalEjecutadoFinal > maxPeriodo ? totalEjecutadoFinal - maxPeriodo : 0;
      const valorFinal = ntPeriodo - descontar + reconocer;

      // ── Narrativa debajo de gráfica 2 (CUPS) ──
      const detalleCups = mesData.map((m, i) => {
        if (i === mesData.length - 1) return `y en mes de ${m.name} un ${fmtN(m.cups)} así concluyendo el ${periodoLabel.toLowerCase()}`;
        return `para un total de CUPS ${fmtN(m.cups)} en el mes de ${m.name}`;
      }).join(', ');

      // ── Estilos ──
      const HS = { bold: true, fontSize: 7, fillColor: '#e0e7ff' as string };
      const CS = { fontSize: 7 };
      const TS2 = { bold: true, fontSize: 7, fillColor: '#bfdbfe' as string };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docDef: any = {
        pageSize: 'A4',
        pageMargins: [38, 45, 38, 45],
        defaultStyle: { font: 'Roboto', fontSize: 7.5, lineHeight: 1.2 },
        styles: {
          p: { fontSize: 7.5, alignment: 'justify', margin: [0, 0, 0, 3] },
          bold: { bold: true },
          sectionHead: { fontSize: 8, bold: true, alignment: 'center', margin: [0, 4, 0, 2] },
          chartLabel: { fontSize: 7.5, bold: true, margin: [0, 4, 0, 1] },
          tableTitle: { fontSize: 9, bold: true, alignment: 'center', margin: [0, 6, 0, 4], decoration: 'underline' },
        },
        content: [

          // ══ CABECERA DE PROCESO ══
          {
            table: {
              widths: ['*', 'auto', 'auto', 'auto', 'auto'],
              body: [[
                { text: 'PROCESO: DIRECCIÓN DEL RIESGO NACIONAL EN SALUD', bold: true, fontSize: 6.5, fillColor: '#dbeafe' },
                { text: 'Código: DI-MT-SD-F-14', fontSize: 6.5, alignment: 'center' },
                { text: 'Versión: 01', fontSize: 6.5, alignment: 'center' },
                { text: 'Emisión: 21/02/2023', fontSize: 6.5, alignment: 'center' },
                { text: 'Vigencia: 22/02/2023', fontSize: 6.5, alignment: 'center' },
              ]],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 2],
          },

          // Título principal
          { text: 'INFORME DEL COMPONENTE DIRECCIÓN DEL RIESGO NACIONAL EN SALUD- CONTRATOS PGP', fontSize: 8.5, bold: true, alignment: 'center', margin: [0, 0, 0, 1] },

          // ══ TABLA ENCABEZADO ══
          {
            table: {
              widths: ['auto', '*', 'auto', '*'],
              body: [
                [
                  { text: 'INFORME Nº', ...HS },
                  { text: informeNum || '', ...CS },
                  { text: 'FECHA', ...HS },
                  { text: new Date().toLocaleDateString('es-CO') + ' 12:00 a. m.', ...CS },
                ],
                [
                  { text: 'EMPRESA', ...HS },
                  { text: empresa, ...CS },
                  { text: 'NIT', ...HS },
                  { text: nit, ...CS },
                ],
                [
                  { text: 'MUNICIPIO', ...HS },
                  { text: municipio, ...CS },
                  { text: 'DEPARTAMENTO', ...HS },
                  { text: depto, ...CS },
                ],
                [
                  { text: 'Nº CONTRATO', ...HS },
                  { text: contratoNum, ...CS },
                  { text: 'VIGENCIA', ...HS },
                  { text: `${fechaInicio} - ${fechaFin}`, ...CS },
                ],
                [
                  { text: 'PUNTOS A TRATAR:', ...HS },
                  { text: '1. RESULTADO DE LA EVALUACIÓN', ...CS },
                  { text: 'PERIODO EVALUADO', ...HS },
                  { text: periodoLabel, ...CS },
                ],
                [
                  { text: 'RESPONSABLE', ...HS },
                  { text: 'COORDINACION DE MEDIANA Y ALTA COMLEJIDAD', ...CS },
                  { text: 'MESES', ...HS },
                  { text: periodo, ...CS },
                ],
              ],
            },
            margin: [0, 0, 0, 5],
          },

          // ══ OBJETIVO ══
          {
            text: [
              { text: 'OBJETIVO: ', bold: true, fontSize: 7.5 },
              'Evaluar la ejecución del Acuerdo de Pago Global Prospectivo (PGP) de la DUSAKAWI EPSI, asegurando que se cumplan los términos contractuales y que se garantice la calidad en la prestación de servicios de salud a la población afiliada. Este objetivo incluye la revisión del impacto del PGP en la gestión financiera, el reconocimiento de incrementos en la población afiliada, y la validación de los valores financieros registrados, incluyendo el valor ejecutado, descuentos, y reconocimientos. La evaluación busca garantizar una gestión eficiente, equitativa y orientada a resultados, que refleje de manera precisa el desempeño bajo el modelo de pago prospectivo, incluyendo:',
            ],
            style: 'p',
            margin: [0, 0, 0, 2],
          },

          // Sub-objetivos (sin bullet, negrita + texto)
          { text: [{ text: 'Revisión de la Gestión Financiera: ', bold: true }, 'Analizar cómo el PGP influye en la administración de los recursos financieros de la EPS, evaluando la eficiencia en el uso de los fondos, la precisión en los registros contables y el cumplimiento de los presupuestos establecidos.'], style: 'p' },
          { text: [{ text: 'Impacto en la Calidad del Servicio: ', bold: true }, 'Estudiar los efectos del acuerdo en la calidad de los servicios ofrecidos a los afiliados, verificando el cumplimiento de estándares de calidad, la satisfacción del usuario y la mejora continua en los procesos de atención médica.'], style: 'p' },
          { text: [{ text: 'Reconocimiento de Cambios Demográficos: ', bold: true }, 'Identificar y documentar cualquier incremento en la población afiliada y cómo este cambio afecta la distribución de recursos y la planificación de servicios, asegurando que el modelo PGP se ajusta dinámicamente a las necesidades emergentes.'], style: 'p' },
          { text: [{ text: 'Validación de Valores Financieros: ', bold: true }, 'Confirmar la exactitud de todos los valores financieros registrados bajo el PGP, incluyendo el valor ejecutado del contrato, los descuentos otorgados y los reconocimientos realizados, para garantizar transparencia y responsabilidad.'], style: 'p' },
          { text: [{ text: 'Evaluación de Resultados y Eficiencia: ', bold: true }, 'Medir la eficacia del PGP en la consecución de resultados esperados, como la optimización de costos y la mejora en la atención al paciente, facilitando un análisis de rentabilidad que justifique el modelo de pago.'], style: 'p' },
          { text: [{ text: 'Desarrollo de Recomendaciones para Mejoras Futuras: ', bold: true }, 'Basándose en los hallazgos de la evaluación, proponer ajustes o mejoras al acuerdo PGP que puedan optimizar tanto la gestión financiera como la calidad de la atención a los afiliados.'], style: 'p', margin: [0, 0, 0, 4] },

          // ══ NARRATIVA 1 (antes de gráfica 1) ══
          {
            text: `Para el seguimeinto a la ejecución del los contratos, se lleva a cabo un seguimiento y evaluación desde la Dirección Nacional del Riesgo en Salud. Se verifican los datos reportados por la institución ${empresa} del de ${periodo} quien tiene sede en el municipio de ${municipio} del departamento de ${depto} Se examina detalladamente la información de las acciones y actividades que demandaron los usuarios. Bajo esta perspectiva, se analizan con detalle las acciones destinadas para implementar en el territorio. La institución ${empresa} realizó su reporte mediante el cargue de la información en la plataforma Aryuwi Soft, establecida para dichos fines. Se cuentan con los registros individuales de las siguientes acciones. Además, la EPSI Dusakawi ha implementado el tipo de contrato de pago global prospectivo para optimizar la gestión de recursos y garantizar una atención integral y oportuna a los usuarios. Este modelo de contrato permite una planificación más efectiva de los recursos, promoviendo la prevención y el cuidado de la salud de la población asegurada.`,
            style: 'p',
            margin: [0, 0, 0, 4],
          },

          // ══ GRÁFICA 1 (valor, apilado si hay inesperadas) ══
          {
            text: valorCupsInesperadas > 0
              ? 'GRÁFICO 1. CONSOLIDADO DE EJECUCIÓN EN VALOR POR CUPS — INCLUYE CUPS / TECNOLOGÍAS INESPERADAS'
              : 'GRÁFICO 1. CONSOLIDO DE EJECUCIÓN EN VALOR POR CUPS SEGÚN REPORTE DEL PRESTADOR',
            style: 'chartLabel',
          },
          chart1 ? { image: chart1, width: 490, margin: [0, 0, 0, 4] } : {},

          // ══ NARRATIVA 2 (entre gráficas) ══
          {
            text: `La ejecución de los espacios correspondientes a los códigos CUPS, representados en el gráfico, evidencia el comportamiento financiero y operativo de las notas técnicas derivadas de los contratos suscritos entre Dusakawi EPSI y los prestadores de servicios de salud. Estos códigos, que agrupan los procedimientos y tratamientos médicos realizados durante el período de análisis, constituyen un componente fundamental en el cumplimiento de las obligaciones contractuales y en la trazabilidad de la prestación de servicios. Su adecuada aplicación garantiza la consistencia entre la facturación, la ejecución presupuestal y los registros contables vinculados al proceso de compensación.${valorCupsInesperadas > 0 ? ` Durante el período se identificaron CUPS / Tecnologías Inesperadas${cantInespNum > 0 ? ` (${fmtN(cantInespNum)} códigos)` : ''} con un valor consolidado de ${fmt(valorCupsInesperadas)}, representados en la franja naranja del gráfico anterior, los cuales son incorporados al total ejecutado para efectos del cálculo financiero del período.` : ''}`,
            style: 'p',
          },
          {
            text: `El análisis reflejado en el gráfico permite observar la evolución mensual de la ejecución en términos de valor y volumen de actividades. ${detalleValor} Esta tendencia muestra una ejecución sostenida y controlada, sustentada en la revisión técnica de los reportes mensuales y en la validación de los soportes asociados a los servicios contratados. El consolidado del ${periodoLabel.toLowerCase()}, equivalente a ${fmt(totalEjecutadoFinal)}${valorCupsInesperadas > 0 ? ` (incluye ${fmt(valorCupsInesperadas)} de CUPS / Tecnologías Inesperadas)` : ''}, evidencia la correspondencia entre las actividades ejecutadas y los valores registrados, permitiendo establecer una trazabilidad clara entre las fases de prestación, registro y validación.`,
            style: 'p',
            margin: [0, 0, 0, 4],
          },

          // ══ GRÁFICA 2 (CUPS conteo, apilado si hay inesperadas) ══
          {
            text: cantInespNum > 0
              ? 'GRÁFICO 2. CONSOLIDADO DE ACTIVIDADES CUPS — INCLUYE ACTIVIDADES INESPERADAS'
              : 'GRÁFICO 2. CONSOLIDO DE EJECUCIÓN DE CUPS EMPLEADOS EN EL REPORTE',
            style: 'chartLabel',
          },
          chart2 ? { image: chart2, width: 490, margin: [0, 0, 0, 4] } : {},

          // ══ NARRATIVA 3 (debajo de gráfica 2) ══
          {
            text: `La ejecución de los códigos CUPS en el marco de las notas técnicas de los contratos suscritos entre Dusakawi EPSI y los prestadores de servicios de salud constituye un elemento estructural en la gestión operativa y financiera del modelo de pago prospectivo. Estos códigos identifican los procedimientos, tratamientos e intervenciones médicas suministradas a la población afiliada, y su registro preciso garantiza la coherencia entre la facturación, la compensación y el cumplimiento de los compromisos contractuales. El seguimiento sistemático de su ejecución permite mantener una relación transparente con los prestadores, fortalecer la red de atención y promover la eficiencia en los procesos administrativos. Durante el ${periodoLabel.toLowerCase()} de ${periodo}, la institución ${empresa} reportó ${detalleCups}${cantInespNum > 0 ? `, con un total adicional de ${fmtN(cantInespNum)} actividades correspondientes a CUPS / Tecnologías Inesperadas, las cuales fueron identificadas, validadas e incorporadas al consolidado del período` : ''}.`,
            style: 'p',
          },

          // ══════════════════════
          //       PÁGINA 2
          // ══════════════════════
          { text: 'TABLA 1 . RESUMEN DE EJECUCION DE DE LOS RESULTADO DE LA NOTA TECNICA', style: 'tableTitle', pageBreak: 'before' },

          // Tabla financiera — TABLA 1
          {
            table: {
              widths: ['*', 100, 100],
              body: [
                [
                  { text: 'VALOR ESTIMADO', ...TS2, alignment: 'center' },
                  { text: 'DESCONTAR', ...TS2, alignment: 'center' },
                  { text: 'RECONOCER', ...TS2, alignment: 'center' },
                ],
                [
                  { text: `% MINIMO PERMITIDO 90%   ${fmt(minPeriodo)}`, ...CS },
                  { text: '$ -', ...CS, alignment: 'right' },
                  { text: '$ -', ...CS, alignment: 'right' },
                ],
                [
                  { text: `VALOR DE ${expectedMonths} MES${expectedMonths > 1 ? 'ES' : ''}   ${fmt(ntPeriodoFull)}`, ...CS, bold: true },
                  { text: descontar > 0 ? fmt(descontar) : fmt(0), ...CS, alignment: 'right' },
                  { text: reconocer > 0 ? fmt(reconocer) : fmt(0), ...CS, alignment: 'right' },
                ],
                [
                  { text: `% MAXIMO PERMITIDO 110%   ${fmt(maxPeriodo)}`, ...CS },
                  { text: '$ -', ...CS, alignment: 'right' },
                  { text: '$ -', ...CS, alignment: 'right' },
                ],
                ...(valorCupsInesperadas > 0 ? [[
                  { text: `CUPS / Tecnologías Inesperadas   ${fmt(valorCupsInesperadas)}`, ...CS, color: '#1d4ed8', bold: true },
                  { text: fmt(0), ...CS, alignment: 'right' },
                  { text: fmt(valorCupsInesperadas), ...CS, alignment: 'right', color: '#1d4ed8', bold: true },
                ]] : []),
                [
                  { text: `TOTAL EJECUTADO DEL ${periodoLabel.toUpperCase()}   ${fmt(totalEjecutadoFinal)}`, ...CS, bold: true, fillColor: '#f0fdf4' },
                  { text: descontar > 0 ? fmt(descontar) : fmt(0), ...CS, alignment: 'right', bold: true, color: descontar > 0 ? '#b91c1c' : '#374151' },
                  { text: reconocer > 0 ? fmt(reconocer) : fmt(0), ...CS, alignment: 'right', bold: true, color: reconocer > 0 ? '#047857' : '#374151' },
                ],
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 8],
          },

          // Tabla de pagos anticipados
          { text: 'PAGOS ANTICIPADOS SEGÚN MODELO   80%', bold: true, fontSize: 8, margin: [0, 2, 0, 2] },
          {
            table: {
              widths: ['*', 110, 110],
              body: [
                [
                  { text: 'CONCEPTO', ...TS2, alignment: 'center' },
                  { text: 'VALOR NT MENSUAL', ...TS2, alignment: 'right' },
                  { text: 'PAGO 80%', ...TS2, alignment: 'right' },
                ],
                [
                  { text: 'PAGOS ANTICIPADOS', ...CS, bold: true },
                  { text: fmt(monthlyNT * advanceMonths), ...CS, alignment: 'right' },
                  { text: fmt(totalAdv), ...CS, alignment: 'right', bold: true },
                ],
                // Filas de anticipo: todos los meses cargados (trimestral = todos son anticipos)
                ...(advanceMonths > 0
                  ? mesData.slice(0, advanceMonths).map(m => [
                      { text: m.name, ...CS },
                      { text: fmt(monthlyNT), ...CS, alignment: 'right' },
                      { text: fmt(adv80), ...CS, alignment: 'right' },
                    ])
                  : [[{ text: '(Pago directo mensual)', ...CS, italics: true }, { text: fmt(monthlyNT), ...CS, alignment: 'right' }, { text: fmt(monthlyNT * 0.8), ...CS, alignment: 'right' }]]),
                [
                  {
                    text: periodType === 'trimestral'
                      ? `TOTAL VALOR A PAGAR EN EL MES DE LIQUIDACIÓN (3er MES)`
                      : `TOTAL VALOR A PAGAR EN EL ÚLTIMO MES`,
                    ...CS, bold: true
                  },
                  { text: fmt(ntPeriodoFull), ...CS, alignment: 'right', bold: true },
                  { text: fmt(advanceMonths === 0 ? adv80 : (lastMonthPay > 0 ? lastMonthPay : 0)), ...CS, alignment: 'right', bold: true },
                ],
                [
                  { text: 'TOTAL CONTRATO DEL PERÍODO', ...CS, bold: true },
                  { text: '', ...CS },
                  { text: fmt(ntPeriodoFull), ...CS, alignment: 'right', bold: true },
                ],
                [
                  { text: 'TOTAL ANTICIPOS PAGADOS', ...CS, bold: true },
                  { text: '', ...CS },
                  { text: fmt(totalAdv), ...CS, alignment: 'right', bold: true },
                ],
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 12],
          },

          // Firma — sección antes de la narrativa
          { text: 'Se firma por', fontSize: 7.5, margin: [0, 4, 0, 6] },
          {
            columns: [
              {
                stack: [
                  { text: '________________________________', alignment: 'center', fontSize: 7.5 },
                  { text: 'REPRESENTANTE LEGAL', bold: true, alignment: 'center', fontSize: 7 },
                  { text: empresa, alignment: 'center', fontSize: 7, italics: true },
                  { text: `NIT: ${nit}`, alignment: 'center', fontSize: 6.5, color: '#555555' },
                ],
              },
              {
                stack: [
                  { text: '________________________________', alignment: 'center', fontSize: 7.5 },
                  { text: 'REPRESENTANTE LEGAL', bold: true, alignment: 'center', fontSize: 7 },
                  { text: 'DUSAKAWI EPSI', alignment: 'center', fontSize: 7, italics: true },
                  { text: 'NIT: 813.001.862-0', alignment: 'center', fontSize: 6.5, color: '#555555' },
                ],
              },
            ],
            margin: [0, 0, 0, 14],
          },
          {
            columns: [
              {
                stack: [
                  { text: '________________________________', alignment: 'center', fontSize: 7.5 },
                  { text: 'SUPERVISOR DEL CONTRATO', bold: true, alignment: 'center', fontSize: 7 },
                  { text: supervisorName || 'DUSAKAWI EPSI', alignment: 'center', fontSize: 7, italics: true },
                ],
              },
              {
                stack: [
                  { text: '________________________________', alignment: 'center', fontSize: 7.5 },
                  { text: responsable, bold: true, alignment: 'center', fontSize: 7 },
                  { text: 'Dir. Nacional del Riesgo en Salud', alignment: 'center', fontSize: 6.5, color: '#555555' },
                ],
              },
            ],
            margin: [0, 0, 0, 10],
          },

          // ── Nota de ejecución financiera ──
          ...(notaEjecucionFinanciera.trim() ? [
            {
              text: 'NOTA DE EJECUCIÓN FINANCIERA:',
              bold: true, fontSize: 7.5, margin: [0, 8, 0, 2],
            },
            {
              table: {
                widths: ['*'],
                body: [[{
                  text: notaEjecucionFinanciera.trim(),
                  fontSize: 7.5, alignment: 'justify',
                  margin: [4, 4, 4, 4],
                }]],
              },
              layout: { hLineColor: () => '#93c5fd', vLineColor: () => '#93c5fd' },
              fillColor: '#eff6ff',
              margin: [0, 0, 0, 6],
            },
          ] : []),

          // ── Notas adicionales ──
          ...(notaAdicional.trim() ? [
            {
              text: 'OBSERVACIONES ADICIONALES:',
              bold: true, fontSize: 7.5, margin: [0, 4, 0, 2],
            },
            {
              table: {
                widths: ['*'],
                body: [[{
                  text: notaAdicional.trim(),
                  fontSize: 7.5, alignment: 'justify',
                  margin: [4, 4, 4, 4],
                }]],
              },
              layout: { hLineColor: () => '#d1fae5', vLineColor: () => '#d1fae5' },
              fillColor: '#f0fdf4',
              margin: [0, 0, 0, 6],
            },
          ] : []),

          // Nota legal
          {
            text: 'Nota: El valor total programado por concepto de prestación de servicios en salud se encuentra sujeto a los descuentos tributarios que apliquen conforme a la normatividad vigente (retenciones en la fuente, IVA u otros tributos según corresponda). El valor neto a pagar se reflejará una vez efectuadas las deducciones respectivas.',
            fontSize: 6.5, italics: true, alignment: 'justify', margin: [0, 0, 0, 6],
            color: '#555555',
          },

          // ══════════════════════ PÁGINA 3 ══════════════════════
          // Narrativa página 3 — ejecución financiera
          { text: '3. ANÁLISIS FINANCIERO DEL PERÍODO', style: 'sectionHead', pageBreak: 'before', decoration: 'underline', margin: [0, 0, 0, 4] },
          {
            text: `Durante el período contractual comprendido entre ${fechaInicio} y ${fechaFin}, se ha realizado un seguimiento riguroso al cumplimiento de los términos acordados en el contrato ${contratoNum}, garantizando los estándares requeridos en la prestación de servicios de salud a la población afiliada en ${municipio}, ${depto}. Durante los últimos ${n} ${n === 1 ? 'mes' : 'meses'}, se ha contabilizado un total ejecutado de ${fmt(totalEjecutadoFinal)}${valorCupsInesperadas > 0 ? ` (incluye ${fmt(valorCupsInesperadas)} correspondientes a CUPS / Tecnologías Inesperadas)` : ''} en relación con el periodo señalado de ${periodo}. Este resultado es reflejo de una gestión eficiente, de un acompañamiento continuo y de mecanismos de control implementados de forma sistemática para asegurar el cumplimiento de los compromisos establecidos por las partes.`,
            style: 'p',
          },
          {
            text: `En lo que respecta a los aspectos financieros, el valor total de ${fmt(totalEjecutadoFinal)} ha sido calculado, registrado y conciliado mes a mes: ${mesData.map(m => `en ${m.name} se registró un valor ejecutado de ${fmt(m.value)} correspondiente a ${fmtN(m.cups)} actividades en salud`).join('; ')}${valorCupsInesperadas > 0 ? `; adicionalmente se incluye un valor de ${fmt(valorCupsInesperadas)} por concepto de CUPS / Tecnologías Inesperadas` : ''}. Estos montos representan los servicios efectivamente prestados por la IPS en el marco del contrato, y han sido objeto de verificación documental, validación operativa y conciliación administrativa. La franja de riesgo contractual establece un mínimo del 90% equivalente a ${fmt(minPeriodo)} y un máximo del 110% equivalente a ${fmt(maxPeriodo)}.`,
            style: 'p',
          },
          {
            text: `Como consecuencia de lo anterior, se procedió a programar los pagos conforme a lo estipulado contractualmente${advanceMonths > 0
              ? ': se aprobó un pago anticipado equivalente al 80% del valor mensual durante los meses de ' +
                mesData.slice(0, advanceMonths).map(m => `${m.name} (equivalente a ${fmt(adv80)})`).join(' y ') +
                `. Para el mes de ${mesData[mesData.length - 1]?.name || 'cierre'}, se proyectó el pago del saldo pendiente del ${periodoLabel.toLowerCase()}, con un valor equivalente a ${fmt(lastMonthPay > 0 ? lastMonthPay : 0)}, completando así el acumulado de anticipos de ${fmt(totalAdv)}.`
              : '.'} En función de lo previsto contractualmente, se considera un valor a ${descontar > 0 ? `descontar de ${fmt(descontar)} por ejecución inferior al 90%` : 'descontar de $0,00'} y un valor a ${reconocer > 0 ? `reconocer de ${fmt(reconocer)} por ejecución superior al 110%` : 'reconocer de $0,00'}, resultando en un valor estimado final del ${periodoLabel.toLowerCase()} de ${fmt(valorFinal)}.`,
            style: 'p',
          },

          // Tabla resumen final con totales
          {
            table: {
              widths: ['*', 90, 90, 90],
              body: [
                [
                  { text: 'CONCEPTO', ...TS2, alignment: 'left' },
                  { text: 'DESCONTAR', ...TS2, alignment: 'right' },
                  { text: 'RECONOCER', ...TS2, alignment: 'right' },
                  { text: 'VALOR ESTIMADO', ...TS2, alignment: 'right', fillColor: '#bbf7d0' },
                ],
                [
                  { text: `Valor NT del ${periodoLabel} (${periodo})`, ...CS },
                  { text: descontar > 0 ? fmt(descontar) : fmt(0), ...CS, alignment: 'right', color: descontar > 0 ? '#b91c1c' : '#374151' },
                  { text: reconocer > 0 ? fmt(reconocer) : fmt(0), ...CS, alignment: 'right', color: reconocer > 0 ? '#047857' : '#374151' },
                  { text: fmt(valorFinal), ...CS, alignment: 'right', bold: true, fillColor: '#f0fdf4' },
                ],
                [
                  { text: 'Total anticipos pagados (80% mensual)', ...CS },
                  { text: '', ...CS },
                  { text: fmt(totalAdv), ...CS, alignment: 'right' },
                  { text: fmt(totalAdv), ...CS, alignment: 'right', bold: true, fillColor: '#f0fdf4' },
                ],
                [
                  { text: `Saldo a pagar en el mes de cierre (${mesData[mesData.length - 1]?.name || ''})`, ...CS, bold: true },
                  { text: '', ...CS },
                  { text: '', ...CS },
                  { text: fmt(lastMonthPay > 0 ? lastMonthPay : 0), ...CS, alignment: 'right', bold: true, fillColor: '#dcfce7' },
                ],
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 4, 0, 8],
          },

          // Párrafo de cierre
          {
            text: `Finalmente, el total reconocido por valor de ${fmt(valorFinal)} ha sido determinado teniendo en cuenta los valores efectivamente ejecutados, los descuentos aplicados, las retenciones legales y demás ajustes pertinentes. Este proceso garantiza una administración financiera eficaz, una compensación adecuada para todas las partes y refuerza el compromiso con la calidad, la legalidad y la transparencia institucional. El contrato ${contratoNum} se ejecuta con estricto apego a las cláusulas pactadas, al cronograma acordado y a los indicadores de desempeño establecidos, garantizando que la prestación de servicios de salud se realice con excelencia, oportunidad y pertinencia en favor de la población afiliada de ${municipio}, departamento de ${depto}.`,
            style: 'p',
            margin: [0, 0, 0, 6],
          },

          // Narrativa CUPS — consolidado trimestral
          {
            text: `La ejecución de los códigos CUPS durante el ${periodoLabel.toLowerCase()} de ${periodo} evidencia la trazabilidad técnica y financiera de los contratos entre Dusakawi EPSI y ${empresa}. ${mesData.map(m => `En el mes de ${m.name} se documentaron ${fmtN(m.cups)} CUPS con un consolidado financiero de ${fmt(m.value)}`).join('; ')}. El consolidado del período totaliza ${fmtN(totalCups)} actividades en salud y ${fmt(totalEjecutadoFinal)} en valores ejecutados${valorCupsInesperadas > 0 ? ` (de los cuales ${fmt(valorCupsInesperadas)} corresponden a CUPS / Tecnologías Inesperadas)` : ''}, reflejando la correspondencia entre las actividades reportadas y los recursos financieros comprometidos en el marco contractual.`,
            style: 'p',
            margin: [0, 0, 0, 0],
          },
        ],
      };

      pdfMake.createPdf(docDef).download(`Certificado_${periodoLabel}_${periodo}_${empresa.replace(/\s+/g, '_')}.pdf`);
      toast({ title: 'Certificado descargado', description: `${periodoLabel}: ${periodo}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  // Guarda el informe en el registro del servidor
  const handleSave = useCallback(async () => {
    if (!selectedPrestador || !comparisonSummary) return;
    setIsSaving(true);
    try {
      const selectedGroup = periodGroups[selectedPeriodIndex] ?? periodGroups[0];
      const n = selectedGroup?.months.length || 0;
      const valorContratoMensual = parseCurrencyField(selectedPrestador['VALOR CONTRATO']);
      const monthlyNT = valorContratoMensual > 0 ? valorContratoMensual : pgpData!.notaTecnica.valor3m;
      const expectedMonths = periodType === 'trimestral' ? 3 : periodType === 'bimensual' ? 2 : 1;
      const ntPeriodoFull = monthlyNT * expectedMonths;
      const totalEjecutado = selectedGroup?.months.reduce((s, m) => s + m.totalValorEjecutado, 0) || 0;
      const minPeriodo = ntPeriodoFull * 0.9;
      const maxPeriodo = ntPeriodoFull * 1.1;
      const descontar = totalEjecutado < minPeriodo ? minPeriodo - totalEjecutado : 0;
      const reconocer = totalEjecutado > maxPeriodo ? totalEjecutado - maxPeriodo : 0;
      const valorFinal = ntPeriodoFull - descontar + reconocer;
      const advanceMonths = periodType === 'trimestral' ? n : Math.max(0, n - 1);
      const totalAdv = monthlyNT * 0.8 * advanceMonths;
      const ciudadRaw = String(selectedPrestador.CIUDAD || 'RIOHACHA').toUpperCase();

      const res = await fetch('/api/informes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prestador: selectedPrestador.PRESTADOR,
          nit: selectedPrestador.NIT,
          contrato: contrato || selectedPrestador.CONTRATO || '',
          municipio: ciudadRaw,
          departamento: String(selectedPrestador.DEPARTAMENTO || CIUDAD_DEPARTAMENTO[ciudadRaw] || '').toUpperCase(),
          periodo: selectedGroup?.label || '',
          tipoPeriodo: periodType.toUpperCase(),
          ntPeriodo: ntPeriodoFull,
          totalEjecutado,
          descontar,
          reconocer,
          valorFinal,
          totalAnticipos: totalAdv,
          responsable,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedNum(data.numero);
        setInformeNum(String(parseInt(data.numero) + 1).padStart(3, '0'));
        toast({ title: `✓ Informe N° ${data.numero} guardado`, description: `${selectedPrestador.PRESTADOR} · ${selectedGroup?.label}` });
      }
    } catch (e: any) {
      toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [selectedPrestador, comparisonSummary, periodGroups, selectedPeriodIndex, periodType, pgpData, contrato, responsable, supervisorName, toast]);

  const hasData = !!comparisonSummary && !!pgpData && months.length > 0;

  return (
    <Card className="shadow-lg border-primary/20 bg-slate-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-6 w-6 text-primary" />
          Certificado de Ejecución (DI-MT-SD-F-14)
        </CardTitle>
        <CardDescription>
          Reproduce el formato oficial SEGUIMIENTO PGP — CERTIFICADO EJECUCIÓN TRIMESTRAL de Dusakawi EPSI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasData ? (
          <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de período</Label>
            <Select value={periodType} onValueChange={v => { setPeriodType(v as PeriodType); setSelectedPeriodIndex(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trimestral">Trimestral (3 meses)</SelectItem>
                <SelectItem value="bimensual">Bimensual (2 meses)</SelectItem>
                <SelectItem value="mensual">Mensual (1 mes)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={String(selectedPeriodIndex)} onValueChange={v => setSelectedPeriodIndex(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {periodGroups.map((g, i) => (
                  <SelectItem key={i} value={String(i)}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nº Informe</Label>
            <Input value={informeNum} onChange={e => setInformeNum(e.target.value)} placeholder="Ej: 01" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nº Contrato</Label>
            <Input value={contrato} onChange={e => setContrato(e.target.value)} placeholder="Ej: 44847_03_PGP" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Auditor Concurrente Asignado</Label>
            <Input value={responsable} onChange={e => setResponsable(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nombre Supervisor del Contrato</Label>
            <Input value={supervisorName} onChange={e => setSupervisorName(e.target.value)} placeholder="Nombre del supervisor..." />
          </div>
        </div>

        {/* CUPS / Tecnologías Inesperadas — resumen cargado (readonly) */}
        <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3 space-y-1">
          <p className="text-xs font-semibold text-orange-800 flex items-center gap-1">
            🟠 CUPS / Tecnologías Inesperadas <span className="font-normal text-orange-600">(cargado desde módulo CUPS / Tecnologías)</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 font-mono ${valorCupsInesperadas > 0 ? 'border-orange-300 bg-white text-orange-900 font-semibold' : 'border-border bg-muted/40 text-muted-foreground'}`}>
              <span className="text-orange-400">$</span>
              {valorCupsInesperadas > 0
                ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valorCupsInesperadas)
                : 'Sin valor — guarda en módulo CUPS / Tecnologías'}
            </div>
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 font-mono ${parseInt(cantidadCupsInesperadas) > 0 ? 'border-orange-300 bg-white text-orange-900 font-semibold' : 'border-border bg-muted/40 text-muted-foreground'}`}>
              <span className="text-orange-400">#</span>
              {parseInt(cantidadCupsInesperadas) > 0
                ? `${parseInt(cantidadCupsInesperadas).toLocaleString('es-CO')} actividades inesperadas`
                : 'Sin cantidad — ingresa en módulo CUPS / Tecnologías'}
            </div>
          </div>
          {(valorCupsInesperadas > 0 || parseInt(cantidadCupsInesperadas) > 0) && (
            <p className="text-[10px] text-orange-600">El valor se suma al total ejecutado y ambos se grafican en naranja en los gráficos 1 y 2.</p>
          )}
        </div>

        {/* Nota de ejecución financiera */}
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <span>📊</span> Nota de ejecución financiera
          </Label>
          <textarea
            className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            placeholder="Ej: La ejecución del período refleja un incremento del 12% respecto al trimestre anterior..."
            value={notaEjecucionFinanciera}
            onChange={e => setNotaEjecucionFinanciera(e.target.value)}
          />
        </div>

        {/* Notas adicionales */}
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <span>⚙️</span> Notas adicionales
          </Label>
          <textarea
            className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            placeholder="Ej: Favorabilidad alta..."
            value={notaAdicional}
            onChange={e => setNotaAdicional(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleGenerate} disabled={isGenerating} className="flex-1">
            {isGenerating ? <Loader2 className="mr-2 animate-spin h-4 w-4" /> : <FileText className="mr-2 h-4 w-4" />}
            Generar PDF
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={isSaving} className="flex-1 border-green-400 text-green-700 hover:bg-green-50">
            {isSaving ? <Loader2 className="mr-2 animate-spin h-4 w-4" /> : <span className="mr-2">💾</span>}
            {savedNum ? `Guardado N° ${savedNum}` : 'Guardar en Registro'}
          </Button>
          {onSaveAudit && (
            <Button variant="outline" onClick={async () => { setIsSavingAudit(true); await onSaveAudit(); setIsSavingAudit(false); }} disabled={isSavingAudit} className="flex-1 border-blue-400 text-blue-700 hover:bg-blue-50">
              {isSavingAudit ? <Loader2 className="mr-2 animate-spin h-4 w-4" /> : <span className="mr-2">🗂️</span>}
              Guardar Auditoría
            </Button>
          )}
          <Button variant="ghost" size="icon" title="Ver historial de informes"
            onClick={() => { setShowHistorial(v => !v); if (!showHistorial) loadHistorial(); }}>
            📋
          </Button>
        </div>
          </>
        ) : (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
            <FileText className="h-4 w-4 shrink-0" />
            <span>Selecciona un prestador y carga datos JSON para generar nuevos certificados.</span>
          </div>
        )}

        {/* Historial de informes — siempre visible */}
        {(!hasData || showHistorial) && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">📂 Registro de Informes</h4>
              {loadingHistorial && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {historial.length === 0 && !loadingHistorial && (
              <p className="text-xs text-muted-foreground">No hay informes guardados aún.</p>
            )}
            {historial.length > 0 && (
              <div className="overflow-auto max-h-64 rounded-lg border border-border bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">N°</th>
                      <th className="px-3 py-2 text-left font-semibold">Prestador</th>
                      <th className="px-3 py-2 text-left font-semibold">Período</th>
                      <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                      <th className="px-3 py-2 text-right font-semibold">Valor Final</th>
                      <th className="px-3 py-2 text-left font-semibold">Auditor</th>
                      <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((inf: any) => (
                      <tr key={inf.numero} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-1.5 font-mono font-bold text-blue-700">{inf.numero}</td>
                        <td className="px-3 py-1.5 max-w-[160px] truncate" title={inf.prestador}>{inf.prestador}</td>
                        <td className="px-3 py-1.5">{inf.periodo}</td>
                        <td className="px-3 py-1.5">{inf.tipoPeriodo}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-green-700">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(inf.valorFinal)}
                        </td>
                        <td className="px-3 py-1.5 max-w-[140px] truncate text-xs text-blue-700 font-medium" title={inf.responsable}>{inf.responsable || '—'}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{inf.fecha}</td>
                        <td className="px-3 py-1.5 flex items-center gap-2">
                          <button
                            onClick={() => { setViewingInf(inf); setViewPwInput(''); setViewPwError(false); setViewUnlocked(false); }}
                            className="text-blue-400 hover:text-blue-600 transition-colors"
                            title="Ver informe"
                          >👁️</button>
                          <button
                            onClick={() => { setDeletingNum(inf.numero); setPwInput(''); setPwError(false); }}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Eliminar informe"
                          >🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal Ver Informe con contraseña */}
        {viewingInf && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl p-6 w-96 space-y-4">
              <h3 className="font-semibold text-base">📋 Informe N° {viewingInf.numero}</h3>
              {!viewUnlocked ? (
                <>
                  <p className="text-sm text-muted-foreground">Ingresa la contraseña para ver los detalles.</p>
                  <Input
                    type="password"
                    placeholder="Contraseña"
                    value={viewPwInput}
                    onChange={e => { setViewPwInput(e.target.value); setViewPwError(false); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (viewPwInput === '123456') { setViewUnlocked(true); setViewPwError(false); }
                        else setViewPwError(true);
                      }
                    }}
                    className={viewPwError ? 'border-red-500' : ''}
                    autoFocus
                  />
                  {viewPwError && <p className="text-xs text-red-500">Contraseña incorrecta.</p>}
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setViewingInf(null)}>Cancelar</Button>
                    <Button size="sm" onClick={() => {
                      if (viewPwInput === '123456') { setViewUnlocked(true); setViewPwError(false); }
                      else setViewPwError(true);
                    }}>Abrir</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Prestador</span><span className="font-semibold">{viewingInf.prestador}</span></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Período</span><span className="font-semibold">{viewingInf.periodo}</span></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Tipo</span><span className="font-semibold">{viewingInf.tipoPeriodo}</span></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Valor Final</span><span className="font-semibold text-green-700">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(viewingInf.valorFinal)}</span></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">NIT</span><span className="font-semibold">{viewingInf.nit || '—'}</span></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">N° Contrato</span><span className="font-semibold">{viewingInf.contrato || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span><span className="font-semibold">{viewingInf.fecha}</span></div>
                  </div>
                  <div className="flex gap-2 justify-end flex-wrap">
                    <Button size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-50 disabled:opacity-50"
                      onClick={() => { setViewingInf(null); setTimeout(() => handleGenerate(), 100); }}
                      disabled={!hasData || isGenerating}
                      title={!hasData ? 'Carga los datos JSON del prestador para poder regenerar el PDF' : 'Generar PDF'}>
                      {isGenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : '📄'} Generar PDF
                    </Button>
                    {!hasData && (
                      <p className="w-full text-xs text-amber-600 text-center">Para regenerar el PDF, abre la auditoría desde Historial y carga los datos.</p>
                    )}
                    {onSaveAudit && (
                      <Button size="sm" variant="outline" className="border-blue-400 text-blue-700 hover:bg-blue-50"
                        onClick={async () => { await onSaveAudit(); setViewingInf(null); }}>
                        🔄 Reabrir Auditoría
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setViewingInf(null)}>Cerrar</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modal contraseña para eliminar */}
        {deletingNum && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
              <h3 className="font-semibold text-base">🔒 Eliminar Informe N° {deletingNum}</h3>
              <p className="text-sm text-muted-foreground">Ingresa la contraseña para confirmar la eliminación.</p>
              <Input
                type="password"
                placeholder="Contraseña"
                value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                onKeyDown={e => e.key === 'Enter' && handleDeleteConfirm()}
                className={pwError ? 'border-red-500' : ''}
                autoFocus
              />
              {pwError && <p className="text-xs text-red-500">Contraseña incorrecta.</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setDeletingNum(null); setPwInput(''); setPwError(false); }}>
                  Cancelar
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
                  Eliminar
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
