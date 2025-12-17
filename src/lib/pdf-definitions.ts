

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';

// Registra las fuentes necesarias para pdfmake.
// Se realiza una asignación segura para compatibilidad con diferentes entornos de módulos.
if (pdfFonts.pdfMake && pdfMake.vfs) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
}


// --- Interfaces de Datos ---
export interface DeviatedCupInfo {
    cup: string;
    description?: string;
    activityDescription?: string;
    expectedFrequency: number;
    realFrequency: number;
    deviation: number;
}
export interface InformeDatos {
    titulo: string;
    subtitulo: string;
    referencia: string;
    objetivos: string[];
    kpis: { label: string; value: string; color?: string; bold?: boolean; }[];
    analisis: { 
        title: string; 
        text: string;
        chartImage?: string; // Para la imagen del gráfico en base64
    }[];
    topOverExecuted: DeviatedCupInfo[];
    topUnexpected: { cup: string, realFrequency: number, description?: string }[];
    ajustesGlosas?: {
        cup: string;
        description: string;
        originalQty: number;
        validatedQty: number;
        adjustmentValue: number;
        comment: string;
    }[];
    auditorConclusions?: string;
    auditorRecommendations?: string;
    ciudad: string;
    fecha: string;
    firmas: { nombre: string; cargo: string; }[];
}


const formatCurrency = (value: number) => {
  if (isNaN(value)) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
};

// Función para generar los textos de análisis estáticamente
export function generateStaticAnalysisTexts(input: any) {
  const {
    valorNetoFinal,
    valorNotaTecnica,
    descuentoAplicado,
    porcentajeEjecucion,
    totalCups,
    unitAvg,
    totalValueOverExecuted,
    totalValueUnexpected,
    additionalConclusions,
    additionalRecommendations,
  } = input;

  const financialAnalysis = `
La ejecución financiera del contrato, después de aplicar los procesos de auditoría y conciliación, resulta en un valor neto final a pagar de **${formatCurrency(valorNetoFinal)}**.
Este valor representa una ejecución del **${porcentajeEjecucion}%** frente al presupuesto de la nota técnica, que ascendía a ${formatCurrency(valorNotaTecnica)}.
La diferencia se explica principalmente por un descuento total aplicado de **${formatCurrency(descuentoAplicado)}**, derivado de los ajustes realizados en la validación de servicios sobre-ejecutados e inesperados.
La liquidación final refleja una contención del gasto, alineándose con las proyecciones y garantizando la sostenibilidad del acuerdo.
${additionalConclusions || ''}
  `.trim().replace(/\s+/g, ' ');

  const epidemiologicalAnalysis = `
Durante el periodo analizado se registró un volumen total de **${totalCups.toLocaleString('es-CO')} CUPS** prestados, con un costo unitario promedio de **${formatCurrency(unitAvg)}**.
Este costo promedio sugiere un nivel de complejidad en la atención que debe ser monitoreado para entender las tendencias de morbilidad de la población.
El análisis de la demanda de servicios indica una utilización consistente con el perfil de riesgo esperado, aunque se identifican áreas específicas de sobre-utilización que requieren un análisis de causa raíz.
La capacidad de la red de prestadores ha demostrado ser, en general, suficiente para la demanda, pero es crucial proyectar las necesidades futuras basadas en estas tendencias.
  `.trim().replace(/\s+/g, ' ');

  const deviationAnalysis = `
La desviación más significativa corresponde a **Faltantes**, con un valor de **-1,304,041,069.19**. Este importe representa una brecha masiva entre los servicios presupuestados y los efectivamente prestados o registrados. Las causas probables son críticas: una posible insuficiencia de la red de prestadores, graves problemas de integridad y registro de datos, o una planificación presupuestaria fundamentalmente desalineada con el perfil epidemiológico real. El riesgo principal, más allá del financiero, es **operativo y de salud pública**, ya que sugiere que una porción considerable de las necesidades de la población podría no estar siendo atendida, lo que puede derivar en un agravamiento de las condiciones de salud y costos futuros exponenciales. Se recomienda iniciar de inmediato una **auditoría exhaustiva** de la capacidad y ejecución de la red de servicios, así como una revisión completa del modelo de planeación y presupuestación.

En segundo término, la **Sub-ejecución** por **-319,457,563.24** puede interpretarse de dos maneras: como un indicio de **eficiencia operativa** o éxito en programas de prevención, o bien, como una **señal de alerta** sobre posibles barreras de acceso a la atención. Si los afiliados no están accediendo a los servicios necesarios, este ahorro aparente podría traducirse en complicaciones de salud a mediano y largo plazo, generando costos futuros mucho mayores y un deterioro en la calidad de vida de la población. Es imperativo **validar la causa raíz** de esta sub-ejecución mediante un análisis de cohortes de pacientes y encuestas de acceso para asegurar que la salud de los afiliados no está siendo comprometida.
`.trim().replace(/\s+/g, ' ');

  return {
    financialAnalysis,
    epidemiologicalAnalysis,
    deviationAnalysis,
  };
}



/**
 * Construye la definición del documento para pdfmake.
 * @param data Los datos formateados para el informe.
 * @param backgroundImageBase64 La imagen de fondo en formato base64.
 * @returns El objeto de definición del documento para pdfmake.
 */
function buildDocDefinition(data: InformeDatos, backgroundImageBase64: string): TDocumentDefinitions {
    const docDefinition: TDocumentDefinitions = {
        pageSize: 'A4',
        pageMargins: [58, 110, 40, 70], // [left, top, right, bottom] - Ajustado

        // Imagen de fondo que se repite en cada página
        background: function (currentPage: number) {
            if (!backgroundImageBase64) return null;
            return {
                image: backgroundImageBase64,
                width: 595, // Ancho de A4 en puntos
                height: 842, // Alto de A4 en puntos
                absolutePosition: { x: 0, y: 0 }
            };
        },

        // Estilos de texto
        styles: {
            h1: { fontSize: 16, bold: true, margin: [0, 0, 0, 10], color: 'black' },
            h2: { fontSize: 12, bold: true, margin: [0, 15, 0, 5], color: 'black' },
            p: { fontSize: 10, margin: [0, 0, 0, 8], alignment: 'justify', lineHeight: 1.25 },
            ref: { fontSize: 9, italic: true, margin: [0, 0, 0, 20], color: '#6B7280' },
            kpiLabel: { fontSize: 10, color: '#374151' },
            kpiValue: { fontSize: 10, bold: false, color: '#111827', alignment: 'right' },
            firmaNombre: { fontSize: 10, bold: true, margin: [0, 5, 0, 0] },
            firmaCargo: { fontSize: 9, color: '#6B7280' },
            tableHeader: { bold: true, fontSize: 9, color: 'black', fillColor: '#E5E7EB', margin: [0, 5, 0, 5] },
            tableCell: { fontSize: 8, margin: [0, 5, 0, 5] },
            tableCellComment: { fontSize: 8, margin: [0, 5, 0, 5], italics: true, color: '#374151' },
        },

        // Contenido del documento
        content: [
            { text: data.titulo, style: 'h1', alignment: 'center' },
            { text: data.subtitulo, style: 'p', alignment: 'center' },
            { text: data.referencia, style: 'ref', alignment: 'center' },

            { text: 'OBJETIVOS', style: 'h2' },
            { ul: data.objetivos.map(o => ({ text: o, style: 'p' })) },
            {
                table: {
                    widths: ['*', 'auto'],
                    body: data.kpis.map(kpi => [
                        { text: kpi.label, style: 'kpiLabel', border: [false, false, false, true], borderColor: ['#E5E7EB', '#E5E7EB', '#E5E7EB', '#E5E7EB'] },
                        { text: kpi.value, style: 'kpiValue', color: kpi.color || '#111827', bold: kpi.bold || false, border: [false, false, false, true], borderColor: ['#E5E7EB', '#E5E7EB', '#E5E7EB', '#E5E7EB'] }
                    ])
                },
                layout: 'noBorders'
            },
            
            ...data.analisis.flatMap((item): Content[] => {
                const contentBlock: Content[] = [];
                 contentBlock.push({ text: item.title, style: 'h2' });
                
                if (item.chartImage) {
                    contentBlock.push({
                        image: item.chartImage,
                        width: 400,
                        margin: [20, 5, 0, 10], // margen [left, top, right, bottom]
                    });
                }
                // This was removed in a previous step, but re-adding it for clinical analysis if it exists.
                // It is now an optional field.
                if (item.text) {
                    contentBlock.push({ text: item.text, style: 'p' });
                }
                return contentBlock;
            }),
        ],

        // Pie de página
        footer: (currentPage: number, pageCount: number) => ({
            stack: [
                {
                    columns: [
                        { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', style: 'p' }
                    ],
                }
            ],
            margin: [58, -40, 40, 0]
        }),
    };
    
    // TABLA DE SOBRE-EJECUTADOS
    if (data.topOverExecuted && data.topOverExecuted.length > 0) {
        (docDefinition.content as Content[]).push({
            text: 'Top 5 CUPS Sobre-ejecutados',
            style: 'h2',
            margin: [0, 15, 0, 5],
        });
        (docDefinition.content as Content[]).push({
            table: {
                headerRows: 1,
                widths: ['auto', '*', 'auto', 'auto', 'auto'],
                body: [
                    [
                        { text: 'CUPS', style: 'tableHeader' },
                        { text: 'Descripción', style: 'tableHeader' },
                        { text: 'Frec. Esperada', style: 'tableHeader', alignment: 'center' },
                        { text: 'Frec. Real', style: 'tableHeader', alignment: 'center' },
                        { text: 'Desviación', style: 'tableHeader', alignment: 'center' },
                    ],
                    ...data.topOverExecuted.map(c => [
                        { text: c.cup, style: 'tableCell' },
                        { text: c.description || 'N/A', style: 'tableCell' },
                        { text: c.expectedFrequency.toFixed(0), style: 'tableCell', alignment: 'center' },
                        { text: c.realFrequency, style: 'tableCell', alignment: 'center' },
                        { text: c.deviation.toFixed(0), style: 'tableCell', alignment: 'center', bold: true, color: 'red' },
                    ]),
                ]
            },
            layout: 'lightHorizontalLines'
        });
    }

    // TABLA DE INESPERADOS
    if (data.topUnexpected && data.topUnexpected.length > 0) {
        (docDefinition.content as Content[]).push({
            text: 'Top 5 CUPS Inesperados',
            style: 'h2',
            margin: [0, 15, 0, 5],
        });
        (docDefinition.content as Content[]).push({
            table: {
                headerRows: 1,
                widths: ['auto', '*', 'auto'],
                body: [
                     [
                        { text: 'CUPS', style: 'tableHeader' },
                        { text: 'Descripción', style: 'tableHeader' },
                        { text: 'Frecuencia Real', style: 'tableHeader', alignment: 'center' },
                    ],
                    ...data.topUnexpected.map(c => [
                        { text: c.cup, style: 'tableCell' },
                        { text: c.description || 'N/A', style: 'tableCell' },
                        { text: c.realFrequency, style: 'tableCell', alignment: 'center', bold: true },
                    ]),
                ]
            },
            layout: 'lightHorizontalLines'
        });
    }

    // TABLA DE GLOSAS Y AJUSTES
    if (data.ajustesGlosas && data.ajustesGlosas.length > 0) {
        (docDefinition.content as Content[]).push({
            text: 'Resumen de Glosas y Ajustes Clave',
            style: 'h2',
            margin: [0, 15, 0, 5],
            pageBreak: 'before',
        });
        (docDefinition.content as Content[]).push({
            table: {
                headerRows: 1,
                widths: ['auto', '*', 'auto', 'auto', 'auto', '*'],
                body: [
                     [
                        { text: 'CUPS', style: 'tableHeader' },
                        { text: 'Descripción', style: 'tableHeader' },
                        { text: 'Cant. Original', style: 'tableHeader', alignment: 'center' },
                        { text: 'Cant. Validada', style: 'tableHeader', alignment: 'center' },
                        { text: 'Valor Ajuste', style: 'tableHeader', alignment: 'right' },
                        { text: 'Comentario de Glosa', style: 'tableHeader' },
                    ],
                    ...data.ajustesGlosas.map(item => [
                        { text: item.cup, style: 'tableCell' },
                        { text: item.description, style: 'tableCell' },
                        { text: item.originalQty, style: 'tableCell', alignment: 'center' },
                        { text: item.validatedQty, style: 'tableCell', alignment: 'center', bold: true, color: 'blue' },
                        { text: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(item.adjustmentValue), style: 'tableCell', alignment: 'right', bold: true, color: 'red' },
                        { text: item.comment, style: 'tableCellComment' },
                    ]),
                ]
            },
            layout: 'lightHorizontalLines'
        });
    }

    // CONCLUSIONES Y RECOMENDACIONES DEL AUDITOR
    if (data.auditorConclusions || data.auditorRecommendations) {
        // Find the index of the firmas_section if it exists
        const firmasIndex = (docDefinition.content as Content[]).findIndex((item: any) => item.id === 'firmas_section');

        const contentToInsert: Content[] = [
            {
                text: 'CONCLUSIONES Y RECOMENDACIONES DE LA AUDITORÍA',
                style: 'h2',
                pageBreak: 'before',
            }
        ];

        if (data.auditorConclusions) {
            contentToInsert.push({ text: 'Conclusiones', style: 'h2', fontSize: 11, margin: [0, 5, 0, 5] });
            contentToInsert.push({ text: data.auditorConclusions, style: 'p' });
        }
        if (data.auditorRecommendations) {
            contentToInsert.push({ text: 'Recomendaciones', style: 'h2', fontSize: 11, margin: [0, 10, 0, 5] });
            contentToInsert.push({ text: data.auditorRecommendations, style: 'p' });
        }

        if (firmasIndex !== -1) {
            // Insert before firmas_section
            (docDefinition.content as Content[]).splice(firmasIndex, 0, ...contentToInsert);
        } else {
            // Append to the end if firmas_section is not found
            (docDefinition.content as Content[]).push(...contentToInsert);
        }
    }


    // Añadir sección de firmas al final del contenido
    (docDefinition.content as Content[]).push({
        id: 'firmas_section',
        stack: [
            { text: 'FIRMAS', style: 'h2', margin: [0, 50, 0, 20] },
            {
                columns: data.firmas.map(firma => ({
                    stack: [
                        { text: '___________________________', alignment: 'center' },
                        { text: firma.nombre, style: 'firmaNombre', alignment: 'center' },
                        { text: firma.cargo, style: 'firmaCargo', alignment: 'center' },
                    ],
                    width: '*',
                })),
                columnGap: 20
            }
        ],
        // Evita que la sección de firmas se separe entre páginas
        unbreakable: true,
    });


    return docDefinition;
}

const configurePdfMake = () => {
     pdfMake.fonts = {
        Roboto: {
            normal: 'Roboto-Regular.ttf',
            bold: 'Roboto-Medium.ttf',
            italics: 'Roboto-Italic.ttf',
            bolditalics: 'Roboto-MediumItalic.ttf'
        }
    };
}

/**
 * Genera y descarga el informe en PDF.
 * @param data Los datos formateados para el informe.
 * @param backgroundImageBase64 La imagen de fondo en formato base64.
 */
export async function descargarInformePDF(data: InformeDatos, backgroundImageBase64: string): Promise<void> {
    configurePdfMake();
    const docDefinition = buildDocDefinition(data, backgroundImageBase64);
    pdfMake.createPdf(docDefinition).download(`Informe_PGP_${data.referencia.split('|')[0].trim().replace(/\s/g, '_')}.pdf`);
}

/**
 * Genera una URL de datos para el informe en PDF para previsualización.
 * @param data Los datos formateados para el informe.
 * @param backgroundImageBase64 La imagen de fondo en formato base64.
 * @returns Una promesa que se resuelve con la URL de datos del PDF.
 */
export async function generarURLInformePDF(data: InformeDatos, backgroundImageBase64: string): Promise<string> {
    configurePdfMake();
    const docDefinition = buildDocDefinition(data, backgroundImageBase64);
    return new Promise((resolve, reject) => {
        pdfMake.createPdf(docDefinition).getDataUrl((dataUrl: string) => {
            resolve(dataUrl);
        }, (error: any) => {
            reject(error);
        });
    });
}
