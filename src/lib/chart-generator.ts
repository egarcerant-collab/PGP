/**
 * Genera gráficos como imágenes base64 usando Chart.js + canvas HTML
 * Para ser embebidos en el PDF con pdfmake
 */

import { Chart, ChartConfiguration, registerables } from 'chart.js';
Chart.register(...registerables);

export interface MonthlyChartData {
  month: string;
  cups: number;
  value: number;
  accumulated: number;
  percVsMeta: number;
  percVsRef: number;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

const COLORS = {
  primary: '#1a365d',
  secondary: '#2b6cb0',
  accent: '#38a169',
  warning: '#d69e2e',
  danger: '#e53e3e',
  light: '#ebf8ff',
  gray: '#718096',
  teal: '#319795',
};

const COP_FORMAT = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const NUM_FORMAT = (n: number) =>
  new Intl.NumberFormat('es-CO').format(n);

/** Gráfico 1: Ejecución mensual (CUPS + Valor) — barras dobles */
export async function generarGraficoEjecucionMensual(meses: MonthlyChartData[], referenciaMensual: number): Promise<string> {
  const canvas = createCanvas(900, 420);
  const ctx = canvas.getContext('2d')!;

  const labels = meses.map(m => m.month.substring(0, 3).toUpperCase());
  const valoresM = meses.map(m => m.value);
  const referenciaLinea = meses.map(() => referenciaMensual);

  const chart = new Chart(ctx as any, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Valor Ejecutado ($)',
          data: valoresM,
          backgroundColor: valoresM.map(v => v >= referenciaMensual ? COLORS.accent : COLORS.warning),
          borderColor: valoresM.map(v => v >= referenciaMensual ? COLORS.accent : COLORS.warning),
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Referencia Mensual',
          data: referenciaLinea,
          type: 'line',
          borderColor: COLORS.danger,
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: 'Ejecución Financiera Mensual vs Referencia Técnica (2025)',
          font: { size: 14, weight: 'bold' },
          color: COLORS.primary,
        },
        legend: { position: 'bottom' },
      },
      scales: {
        y: {
          title: { display: true, text: 'Valor ($COP)', color: COLORS.gray },
          ticks: {
            callback: (v: any) => COP_FORMAT(v),
            font: { size: 9 },
          },
        },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  } as ChartConfiguration);

  chart.draw();
  const base64 = canvasToBase64(canvas);
  chart.destroy();
  return base64;
}

/** Gráfico 2: Acumulado vs Meta Anual — líneas */
export async function generarGraficoAcumulado(meses: MonthlyChartData[], metaAnual: number): Promise<string> {
  const canvas = createCanvas(900, 380);
  const ctx = canvas.getContext('2d')!;

  const labels = meses.map(m => m.month.substring(0, 3).toUpperCase());
  const acumulados = meses.map(m => m.accumulated);
  const metaProgresiva = meses.map((_, i) => (metaAnual / 12) * (i + 1));

  const chart = new Chart(ctx as any, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Ejecución Acumulada',
          data: acumulados,
          borderColor: COLORS.secondary,
          backgroundColor: 'rgba(43,108,176,0.12)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: COLORS.secondary,
          pointRadius: 5,
        },
        {
          label: 'Meta Progresiva (Referencia)',
          data: metaProgresiva,
          borderColor: COLORS.danger,
          borderDash: [6, 3],
          fill: false,
          tension: 0,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: 'Curva de Acumulación Anual vs Meta Contractual (2025)',
          font: { size: 14, weight: 'bold' },
          color: COLORS.primary,
        },
        legend: { position: 'bottom' },
      },
      scales: {
        y: {
          title: { display: true, text: 'Valor Acumulado ($COP)', color: COLORS.gray },
          ticks: {
            callback: (v: any) => COP_FORMAT(v),
            font: { size: 9 },
          },
        },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  } as ChartConfiguration);

  chart.draw();
  const base64 = canvasToBase64(canvas);
  chart.destroy();
  return base64;
}

/** Gráfico 3: CUPS mensuales — barras */
export async function generarGraficoCups(meses: MonthlyChartData[]): Promise<string> {
  const canvas = createCanvas(900, 360);
  const ctx = canvas.getContext('2d')!;

  const labels = meses.map(m => m.month.substring(0, 3).toUpperCase());
  const cupsMes = meses.map(m => m.cups);
  const avgCups = cupsMes.reduce((a, b) => a + b, 0) / cupsMes.length;

  const chart = new Chart(ctx as any, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'CUPS Atendidas',
          data: cupsMes,
          backgroundColor: cupsMes.map(c => c >= avgCups ? COLORS.teal : COLORS.gray),
          borderWidth: 1,
        },
        {
          label: 'Promedio Mensual',
          data: cupsMes.map(() => avgCups),
          type: 'line',
          borderColor: COLORS.warning,
          borderDash: [5, 3],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: 'Volumen Mensual de Actividades (CUPS) — Producción Asistencial 2025',
          font: { size: 14, weight: 'bold' },
          color: COLORS.primary,
        },
        legend: { position: 'bottom' },
      },
      scales: {
        y: {
          title: { display: true, text: 'Cantidad de CUPS', color: COLORS.gray },
          ticks: { callback: (v: any) => NUM_FORMAT(v), font: { size: 9 } },
        },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  } as ChartConfiguration);

  chart.draw();
  const base64 = canvasToBase64(canvas);
  chart.destroy();
  return base64;
}

/** Gráfico 4: Distribución trimestral — dona */
export async function generarGraficoTrimestral(meses: MonthlyChartData[]): Promise<string> {
  const canvas = createCanvas(600, 380);
  const ctx = canvas.getContext('2d')!;

  const t1 = meses.slice(0, 3).reduce((a, b) => a + b.value, 0);
  const t2 = meses.slice(3, 6).reduce((a, b) => a + b.value, 0);
  const t3 = meses.slice(6, 9).reduce((a, b) => a + b.value, 0);
  const t4 = meses.slice(9, 12).reduce((a, b) => a + b.value, 0);
  const total = t1 + t2 + t3 + t4;

  const chart = new Chart(ctx as any, {
    type: 'doughnut',
    data: {
      labels: [
        `T1 (Ene-Mar) ${((t1/total)*100).toFixed(1)}%`,
        `T2 (Abr-Jun) ${((t2/total)*100).toFixed(1)}%`,
        `T3 (Jul-Sep) ${((t3/total)*100).toFixed(1)}%`,
        `T4 (Oct-Dic) ${((t4/total)*100).toFixed(1)}%`,
      ],
      datasets: [{
        data: [t1, t2, t3, t4],
        backgroundColor: [COLORS.primary, COLORS.secondary, COLORS.teal, COLORS.accent],
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: 'Distribución Trimestral del Gasto Ejecutado 2025',
          font: { size: 14, weight: 'bold' },
          color: COLORS.primary,
        },
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
      },
    },
  } as ChartConfiguration);

  chart.draw();
  const base64 = canvasToBase64(canvas);
  chart.destroy();
  return base64;
}

/** Gráfico 5: % de cumplimiento mensual vs referencia — barras horizontales */
export async function generarGraficoCumplimiento(meses: MonthlyChartData[]): Promise<string> {
  const canvas = createCanvas(900, 420);
  const ctx = canvas.getContext('2d')!;

  const labels = meses.map(m => m.month.substring(0, 3).toUpperCase());
  const porcentajes = meses.map(m => m.percVsRef);

  const chart = new Chart(ctx as any, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '% Ejecución vs Referencia Mensual',
          data: porcentajes,
          backgroundColor: porcentajes.map(p => {
            if (p >= 90 && p <= 110) return COLORS.accent;
            if (p < 90) return COLORS.warning;
            return COLORS.danger;
          }),
          borderWidth: 1,
        },
        {
          label: 'Banda mínima (90%)',
          data: labels.map(() => 90),
          type: 'line',
          borderColor: COLORS.warning,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Banda máxima (110%)',
          data: labels.map(() => 110),
          type: 'line',
          borderColor: COLORS.danger,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: '% de Cumplimiento Mensual vs Banda de Control Técnica (90%-110%)',
          font: { size: 14, weight: 'bold' },
          color: COLORS.primary,
        },
        legend: { position: 'bottom' },
      },
      scales: {
        y: {
          title: { display: true, text: '% vs Referencia', color: COLORS.gray },
          ticks: { callback: (v: any) => `${v}%`, font: { size: 9 } },
          min: 0,
        },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  } as ChartConfiguration);

  chart.draw();
  const base64 = canvasToBase64(canvas);
  chart.destroy();
  return base64;
}

export async function generarTodosLosGraficos(meses: MonthlyChartData[], metaAnual: number, referenciaMensual: number) {
  const [ejecucion, acumulado, cups, trimestral, cumplimiento] = await Promise.all([
    generarGraficoEjecucionMensual(meses, referenciaMensual),
    generarGraficoAcumulado(meses, metaAnual),
    generarGraficoCups(meses),
    generarGraficoTrimestral(meses),
    generarGraficoCumplimiento(meses),
  ]);
  return { ejecucion, acumulado, cups, trimestral, cumplimiento };
}
