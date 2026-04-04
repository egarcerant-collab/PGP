"use client";

import React, { useState, useMemo } from "react";
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

/** Dibuja una gráfica de barras y devuelve base64 PNG */
function drawBarChart(
  labels: string[], values: number[], color: string, W = 490, H = 160
): string {
  if (typeof window === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const maxVal = Math.max(...values, 1);
  const n = labels.length;
  const padL = 5, padR = 5, padTop = 8, padBot = 30;
  const cW = W - padL - padR, cH = H - padTop - padBot;
  const gap = 16, bW = (cW - gap * (n + 1)) / n;
  labels.forEach((label, i) => {
    const x = padL + gap + i * (bW + gap);
    const bH = (values[i] / maxVal) * cH;
    const y = padTop + cH - bH;
    ctx.fillStyle = color; ctx.fillRect(x, y, bW, bH);
    ctx.fillStyle = '#1e3a5f'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center';
    const v = values[i] >= 1_000_000 ? `$${(values[i] / 1_000_000).toFixed(1)}M` : `$${(values[i]/1000).toFixed(0)}k`;
    ctx.fillText(v, x + bW / 2, y - 2);
    ctx.fillStyle = '#333'; ctx.font = '8px Arial';
    ctx.fillText(label.substring(0, 3), x + bW / 2, padTop + cH + 14);
  });
  return canvas.toDataURL('image/png');
}

export default function CertificadoTrimestral({
  comparisonSummary, pgpData, selectedPrestador, executionDataByMonth,
}: CertificadoTrimestralProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('trimestral');
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [informeNum, setInformeNum] = useState('');
  const [contrato, setContrato] = useState(selectedPrestador?.CONTRATO || '');
  const [responsable, setResponsable] = useState('EDUARDO GARCERANT GONZALEZ');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

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
      const monthlyNT = pgpData.notaTecnica.valor3m / 3;
      const n = selectedGroup.months.length;
      const ntPeriodo = monthlyNT * n;
      const minPeriodo = ntPeriodo * 0.9;
      const maxPeriodo = ntPeriodo * 1.1;
      const adv80 = monthlyNT * 0.8;
      const advanceMonths = n > 1 ? n - 1 : 0;
      const totalAdv = adv80 * advanceMonths;
      const lastMonthPay = ntPeriodo - totalAdv;

      const mesData = selectedGroup.months.map(m => {
        const ex = executionDataByMonth.get(m.month);
        return {
          name: MONTH_ES[m.month] || m.month.toUpperCase(),
          value: m.totalValorEjecutado,
          cups: ex?.uniqueCupCount ?? ex?.totalCups ?? 0,
        };
      });

      const empresa = selectedPrestador.PRESTADOR || '';
      const nit = selectedPrestador.NIT || '';
      const municipio = (selectedPrestador as Record<string, string>)['MUNICIPIO'] || 'RIOHACHA';
      const depto = (selectedPrestador as Record<string, string>)['DEPARTAMENTO'] || 'LA GUAJIRA';
      const periodoLabel = periodType === 'trimestral' ? 'TRIMESTRE' : periodType === 'bimensual' ? 'BIMESTRE' : 'MES';
      const contratoNum = contrato || selectedPrestador.CONTRATO || 'N/A';
      const periodo = selectedGroup.label;

      // ── Gráficas ──
      const labels = mesData.map(m => m.name);
      const chart1 = drawBarChart(labels, mesData.map(m => m.value), '#1d4ed8');
      const chart2 = drawBarChart(labels, mesData.map(m => m.cups), '#15803d');

      // ── Narrativa entre gráficas (valores) ──
      const detalleValor = mesData.map((m, i) => {
        if (i === 0) return `En el mes de ${m.name}, se registró un total de ${fmtN(m.cups)} actividades asociadas a CUPS (Códigos Únicos en Salud), con un consolidado en costos equivalente a ${fmt(m.value)}.`;
        if (i === mesData.length - 1) return `Finalmente, en el mes de ${m.name}, la ejecución alcanzó ${fmtN(m.cups)} actividades, reflejando un costo acumulado de ${fmt(m.value)}.`;
        return `Durante el mes de ${m.name}, el comportamiento presentó una variación correspondiente a ${fmtN(m.cups)} actividades, para un total consolidado de ${fmt(m.value)}.`;
      }).join(' ');

      const totalEjecutado = mesData.reduce((a, m) => a + m.value, 0);
      const totalCups = mesData.reduce((a, m) => a + m.cups, 0);

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
                  { text: '01/01/2025-01/12/2025', ...CS },
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

          // ══ GRÁFICA 1 (valor) ══
          { text: 'GRÁFICO 1. CONSOLIDO DE EJECUCIÓN EN VALOR POR CUPS SEGÚN REPORTE DEL PRESTADOR', style: 'chartLabel' },
          chart1 ? { image: chart1, width: 490, margin: [0, 0, 0, 4] } : {},

          // ══ NARRATIVA 2 (entre gráficas) ══
          {
            text: `La ejecución de los espacios correspondientes a los códigos CUPS, representados en el gráfico, evidencia el comportamiento financiero y operativo de las notas técnicas derivadas de los contratos suscritos entre Dusakawi EPSI y los prestadores de servicios de salud. Estos códigos, que agrupan los procedimientos y tratamientos médicos realizados durante el período de análisis, constituyen un componente fundamental en el cumplimiento de las obligaciones contractuales y en la trazabilidad de la prestación de servicios. Su adecuada aplicación garantiza la consistencia entre la facturación, la ejecución presupuestal y los registros contables vinculados al proceso de compensación.`,
            style: 'p',
          },
          {
            text: `El análisis reflejado en el gráfico permite observar la evolución mensual de la ejecución en términos de valor y volumen de actividades. ${detalleValor} Esta tendencia muestra una ejecución sostenida y controlada, sustentada en la revisión técnica de los reportes mensuales y en la validación de los soportes asociados a los servicios contratados. El consolidado del ${periodoLabel.toLowerCase()}, equivalente a ${fmt(totalEjecutado)}, evidencia la correspondencia entre las actividades ejecutadas y los valores registrados, permitiendo establecer una trazabilidad clara entre las fases de prestación, registro y validación.`,
            style: 'p',
            margin: [0, 0, 0, 4],
          },

          // ══ GRÁFICA 2 (CUPS) ══
          { text: 'GRÁFICO 2. CONSOLIDO DE EJECUCIÓN DE CUPS EMPLEADOS EN EL REPORTE', style: 'chartLabel' },
          chart2 ? { image: chart2, width: 490, margin: [0, 0, 0, 4] } : {},

          // ══ NARRATIVA 3 (debajo de gráfica 2) ══
          {
            text: `La ejecución de los espacios códigos Cups en valor de ejecución de las notas técnicas de los contratos entre Dusakawi EPSI y los prestadores de servicios médicos es un componente esencial en nuestra operación diaria, estos códigos representan los procedimientos y tratamientos médicos proporcionados a nuestros afiliados, y su correcta aplicación garantiza la precisión en la facturación y el cumplimiento de los términos acordados en los contratos. A través de una ejecución meticulosa de estos códigos, hemos podido mantener una relación transparente y colaborativa con nuestros proveedores de servicios de salud. Esto nos ha permitido asegurar la calidad y continuidad en la atención médica brindada a nuestros afiliados, al tiempo que fortalece nuestra red de atención y promueve la eficiencia en los procesos administrativos, ${detalleCups}`,
            style: 'p',
          },

          // ══════════════════════
          //       PÁGINA 2
          // ══════════════════════
          { text: 'TABLA 1 . RESUMEN DE EJECUCION DE DE LOS RESULTADO DE LA NOTA TECNICA', style: 'tableTitle', pageBreak: 'before' },

          // Tabla financiera
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
                  { text: '- $', ...CS, alignment: 'right' },
                  { text: '- $', ...CS, alignment: 'right' },
                ],
                [
                  { text: `VALOR DE ${n} MES${n > 1 ? 'ES' : ''}   ${fmt(ntPeriodo)}`, ...CS, bold: true },
                  { text: fmt(0), ...CS, alignment: 'right' },
                  { text: fmt(0), ...CS, alignment: 'right' },
                ],
                [
                  { text: `% MAXIMO PERMITIDO 110%   ${fmt(maxPeriodo)}`, ...CS },
                  { text: '- $', ...CS, alignment: 'right' },
                  { text: '- $', ...CS, alignment: 'right' },
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
                // advance months rows
                ...(advanceMonths > 0
                  ? mesData.slice(0, advanceMonths).map(m => [
                      { text: m.name, ...CS },
                      { text: fmt(monthlyNT), ...CS, alignment: 'right' },
                      { text: fmt(adv80), ...CS, alignment: 'right' },
                    ])
                  : [[{ text: '(Pago directo mensual)', ...CS, italics: true }, { text: fmt(monthlyNT), ...CS, alignment: 'right' }, { text: fmt(monthlyNT), ...CS, alignment: 'right' }]]),
                [
                  { text: `TOTAL VALOR A PAGAR EN EL ${n > 1 ? 'ÚLTIMO' : ''} MES`, ...CS, bold: true },
                  { text: fmt(ntPeriodo), ...CS, alignment: 'right', bold: true },
                  { text: fmt(lastMonthPay > 0 ? lastMonthPay : 0), ...CS, alignment: 'right', bold: true },
                ],
                [
                  { text: 'TOTAL', ...CS, bold: true },
                  { text: '', ...CS },
                  { text: fmt(ntPeriodo), ...CS, alignment: 'right', bold: true },
                ],
                [
                  { text: 'TOTAL ANTICIPOS', ...CS, bold: true },
                  { text: '', ...CS },
                  { text: fmt(totalAdv), ...CS, alignment: 'right', bold: true },
                ],
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 12],
          },

          // Firma
          { text: 'Se firma por', fontSize: 7.5, margin: [0, 4, 0, 6] },
          {
            columns: [
              {
                stack: [
                  { text: '________________________________', alignment: 'center', fontSize: 7.5 },
                  { text: 'REPRESENTANTE LEGAL DE', bold: true, alignment: 'center', fontSize: 7 },
                  { text: empresa, alignment: 'center', fontSize: 7 },
                ],
              },
              {
                stack: [
                  { text: '________________________________', alignment: 'center', fontSize: 7.5 },
                  { text: 'REPRESENTANTE LEGAL DE', bold: true, alignment: 'center', fontSize: 7 },
                  { text: 'DUSAKAWI EPSI', alignment: 'center', fontSize: 7 },
                ],
              },
            ],
            margin: [0, 0, 0, 16],
          },
          {
            columns: [
              {
                stack: [
                  { text: '________________________________', alignment: 'center', fontSize: 7.5 },
                  { text: 'SUPERVISOR DEL CONTRATO DUSAKAWI EPSI', bold: true, alignment: 'center', fontSize: 7 },
                ],
              },
              {
                stack: [
                  { text: '________________________________', alignment: 'center', fontSize: 7.5 },
                  { text: responsable, bold: true, alignment: 'center', fontSize: 7 },
                ],
              },
            ],
            margin: [0, 0, 0, 16],
          },

          // Nota legal
          {
            text: 'Nota: El valor total programado por concepto de prestación de servicios en salud se encuentra sujeto a los descuentos tributarios que apliquen conforme a la normatividad vigente (retenciones en la fuente, IVA u otros tributos según corresponda). El valor neto a pagar se reflejará una vez efectuadas las deducciones respectivas.',
            fontSize: 6.5, italics: true, alignment: 'justify', margin: [0, 0, 0, 8],
          },

          // Narrativa página 2 (larga)
          {
            text: `Durante el período contractual, se ha realizado un seguimiento riguroso al cumplimiento de los términos acordados, garantizando los estándares requeridos en la prestación de servicios de salud. Durante los últimos ${n} meses, se ha contabilizado un total de ${fmt(ntPeriodo)} en relación con la ejecución del contrato correspondiente al periodo señalado de ${periodo}. Este resultado es reflejo de una gestión eficiente, de un acompañamiento continuo y de mecanismos de control implementados de forma sistemática para asegurar el cumplimiento de los compromisos establecidos por las partes. Asimismo, se ha puesto especial atención a la calidad, oportunidad y pertinencia de los servicios prestados por la IPS, en tanto estos constituyen el núcleo del objeto contractual y el eje de nuestra razón de ser.`,
            style: 'p',
          },
          {
            text: `En lo que respecta a los aspectos financieros, el valor total de ${fmt(ntPeriodo)} ha sido calculado, registrado y conciliado mes a mes, de la siguiente manera: ${mesData.map(m => `en el mes identificado como ${m.name} se registró un valor de ${fmt(m.value)}`).join('; ')}. Estos montos representan los servicios efectivamente prestados por la IPS en el marco del contrato, y han sido objeto de verificación documental, validación operativa y conciliación administrativa. Del mismo modo, se ha reconocido el esfuerzo institucional, la transparencia en la relación contractual y la documentación íntegra del proceso, lo cual ha permitido fortalecer la trazabilidad, la equidad y la rendición de cuentas durante cada uno de los meses de ejecución de actividades.`,
            style: 'p',
          },
          {
            text: `Como consecuencia de lo anterior, se procedió a programar los pagos conforme a lo estipulado contractualmente${advanceMonths > 0 ? ': se aprobó un pago equivalente al 80% del valor estipulado durante los meses de ' + mesData.slice(0, advanceMonths).map(m => m.name + ' (equivalente a ' + fmt(adv80) + ')').join(' y de ') + `. Para el último mes, se proyectó el pago correspondiente al saldo del ${periodoLabel.toLowerCase()}, con un valor equivalente a ${fmt(lastMonthPay > 0 ? lastMonthPay : 0)}. A este valor se adiciona el 20% pendiente correspondiente al primer y segundo meses de ejecución, con el fin de alcanzar un acumulado de ${fmt(totalAdv)}.` : '.'} En función de lo previsto contractualmente, se considerará un valor a descontar de ${fmt(0)}, en su defecto, un valor a reconocer de ${fmt(0)}, resultando en un total ejecutado del ${periodoLabel.toLowerCase()} por ${fmt(ntPeriodo)}.`,
            style: 'p',
          },
          {
            text: `Finalmente, el total reconocido, por un valor de ${fmt(ntPeriodo)}, ha sido determinado teniendo en cuenta tanto los valores efectivamente ejecutados como los descuentos aplicados, las retenciones legales, los ajustes derivados de eventuales incidencias y otros reconocimientos pertinentes. Este proceso asegura una administración financiera eficaz, una compensación adecuada para todas las partes involucradas y refuerza el compromiso con la calidad, la legalidad, la transparencia institucional y la responsabilidad operativa del contratista y de la entidad contratante. El contrato ${contratoNum} se ejecuta con estricto apego a las cláusulas pactadas, al cronograma acordado y a los indicadores de desempeño establecidos, garantizando así que la prestación de servicios de salud se realice con excelencia, oportunidad y pertinencia.`,
            style: 'p',
          },

          // Totales finales (igual al original)
          {
            table: {
              widths: ['*', 'auto', 'auto'],
              body: [
                [{ text: '', fontSize: 7 }, { text: fmt(0), fontSize: 7, alignment: 'right' }, { text: fmt(0), fontSize: 7, alignment: 'right' }],
                [{ text: '', fontSize: 7 }, { text: fmt(0), fontSize: 7, alignment: 'right' }, { text: fmt(ntPeriodo), fontSize: 7, alignment: 'right', bold: true }],
              ],
            },
            layout: 'noBorders',
            margin: [0, 4, 0, 0],
          },

          // Narrativa CUPS página 2
          {
            text: `La ejecución de los códigos CUPS, representados en el gráfico, constituye un elemento clave para el análisis técnico y financiero de las notas asociadas a los contratos entre Dusakawi EPSI y los prestadores de servicios de salud. Estos códigos agrupan los procedimientos y tratamientos reportados durante el período de análisis, y su correcta aplicación permite asegurar la coherencia entre la facturación, la trazabilidad administrativa y la ejecución presupuestal de los servicios contratados. Cada valor consignado corresponde a la sumatoria de actividades registradas mensualmente, de acuerdo con los soportes técnicos y administrativos validados en el marco del proceso contractual. ${mesData.map(m => `En el mes de ${m.name}, se documentó un total de ${fmtN(m.cups)} CUPS, con un consolidado financiero equivalente a ${fmt(m.value)}`).join('. ')}. El consolidado del ${periodoLabel.toLowerCase()} evidencia la ejecución técnica y financiera de los códigos CUPS con un total de ${fmtN(totalCups)} actividades y ${fmt(totalEjecutado)} en valores ejecutados.`,
            style: 'p',
            margin: [0, 4, 0, 0],
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

  if (!comparisonSummary || !pgpData || months.length === 0) return null;

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
        <div className="space-y-1">
          <Label className="text-xs">Responsable (firma)</Label>
          <Input value={responsable} onChange={e => setResponsable(e.target.value)} />
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
          {isGenerating ? <Loader2 className="mr-2 animate-spin h-4 w-4" /> : <FileText className="mr-2 h-4 w-4" />}
          Generar Certificado PDF
        </Button>
      </CardContent>
    </Card>
  );
}
