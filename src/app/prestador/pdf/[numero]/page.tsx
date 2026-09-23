'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Informe {
  numero: string;
  prestador: string;
  nit: string;
  contrato: string;
  municipio: string;
  departamento: string;
  periodo: string;
  tipoPeriodo: string;
  fecha: string;
  totalEjecutado: number;
  descontar: number;
  reconocer: number;
  valorFinal: number;
  totalAnticipos: number;
  responsable: string;
  pdfData: {
    notaEjecucionFinanciera?: string;
    notaAdicional?: string;
    supervisorName?: string;
  } | null;
}

function fmt(n: number | undefined | null) {
  if (!n && n !== 0) return '—';
  return '$' + Math.round(n).toLocaleString('es-CO');
}

export default function PrestadorPdfPage() {
  const params = useParams();
  const numero = params?.numero as string;
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json();
        if (!meData?.profile || meData.profile.rol !== 'prestador') {
          window.location.href = '/login';
          return;
        }

        const res = await fetch('/api/informes');
        if (!res.ok) throw new Error('Error al cargar.');
        const data = await res.json();
        const found = (data.informes ?? []).find((i: Informe) => i.numero === numero);
        if (!found) { setError('Informe no encontrado.'); return; }
        setInforme(found);

        // Imprimir automáticamente después de cargar
        setTimeout(() => window.print(), 600);
      } catch (e: any) {
        setError(e.message);
      }
    }
    load();
  }, [numero]);

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#991B1B' }}>
        <p>{error}</p>
        <button onClick={() => window.close()} style={{ marginTop: 12, padding: '6px 12px', cursor: 'pointer' }}>Cerrar</button>
      </div>
    );
  }

  if (!informe) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#6B7280', textAlign: 'center' }}>
        <p>Preparando documento...</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: white; color: #1F2937; }
        .page { max-width: 800px; margin: 0 auto; padding: 32px 40px; }
        .header { border-bottom: 3px solid #2E7D32; padding-bottom: 16px; margin-bottom: 24px; }
        .org { font-size: 11px; color: #4CAF50; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
        .titulo { font-size: 18px; font-weight: 800; color: #1F2937; margin-top: 4px; }
        .subtitulo { font-size: 12px; color: #6B7280; margin-top: 2px; }
        .numero-badge { display: inline-block; background: #2E7D32; color: white; font-size: 13px; font-weight: 700; padding: 4px 14px; border-radius: 20px; margin-top: 10px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 16px; }
        .card-label { font-size: 10px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 3px; }
        .card-value { font-size: 14px; font-weight: 700; color: #111827; }
        .card-value.green { color: #166534; }
        .section-title { font-size: 11px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; margin-top: 20px; border-left: 3px solid #4CAF50; padding-left: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #E8F5E9; color: #2E7D32; font-weight: 700; padding: 8px 12px; text-align: left; border: 1px solid #D1D5DB; }
        td { padding: 8px 12px; border: 1px solid #E5E7EB; color: #374151; }
        td.right { text-align: right; font-family: monospace; }
        td.total { font-weight: 700; color: #166534; background: #F0FDF4; }
        .nota-box { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 12px 16px; margin-top: 6px; }
        .nota-label { font-size: 10px; font-weight: 700; color: #1D4ED8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .nota-text { font-size: 12px; color: #1E40AF; line-height: 1.5; white-space: pre-wrap; }
        .footer { margin-top: 40px; border-top: 1px solid #E5E7EB; padding-top: 16px; display: flex; justify-content: space-between; font-size: 10px; color: #9CA3AF; }
        .firma-line { border-top: 1px solid #374151; width: 200px; margin-top: 40px; padding-top: 6px; font-size: 11px; color: #374151; text-align: center; }
        .firmas { display: flex; justify-content: space-between; margin-top: 48px; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { padding: 20px 32px; }
        }
      `}</style>

      {/* Botón imprimir (solo pantalla) */}
      <div className="no-print" style={{ background: '#2E7D32', padding: '10px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={() => window.print()}
          style={{ background: 'white', color: '#2E7D32', border: 'none', borderRadius: 6, padding: '6px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Imprimir / Guardar PDF
        </button>
        <button onClick={() => window.close()}
          style={{ background: 'transparent', color: 'white', border: '1px solid white', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
          Cerrar
        </button>
      </div>

      <div className="page">
        {/* Encabezado */}
        <div className="header">
          <p className="org">Dusakawi EPSI · Plataforma PGP</p>
          <p className="titulo">Informe de Auditoría de Servicios de Salud</p>
          <p className="subtitulo">Asociación de Cabildos Indígenas del Cesar y La Guajira</p>
          <span className="numero-badge">N° {informe.numero}</span>
        </div>

        {/* Datos del prestador y período */}
        <div className="grid2">
          <div className="card">
            <p className="card-label">Prestador</p>
            <p className="card-value">{informe.prestador}</p>
          </div>
          <div className="card">
            <p className="card-label">NIT</p>
            <p className="card-value">{informe.nit}</p>
          </div>
          <div className="card">
            <p className="card-label">Período auditado</p>
            <p className="card-value">{informe.periodo}</p>
          </div>
          <div className="card">
            <p className="card-label">Tipo de período</p>
            <p className="card-value">{informe.tipoPeriodo}</p>
          </div>
          {informe.contrato && (
            <div className="card">
              <p className="card-label">Contrato</p>
              <p className="card-value">{informe.contrato}</p>
            </div>
          )}
          {informe.municipio && (
            <div className="card">
              <p className="card-label">Municipio / Depto.</p>
              <p className="card-value">{informe.municipio}{informe.departamento ? ` · ${informe.departamento}` : ''}</p>
            </div>
          )}
        </div>

        {/* Resumen financiero */}
        <p className="section-title">Resumen financiero</p>
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total ejecutado</td>
              <td className="right">{fmt(informe.totalEjecutado)}</td>
            </tr>
            {!!informe.descontar && (
              <tr>
                <td>(-) Glosas / Descontar</td>
                <td className="right" style={{ color: '#DC2626' }}>{fmt(informe.descontar)}</td>
              </tr>
            )}
            {!!informe.reconocer && (
              <tr>
                <td>(+) Reconocer</td>
                <td className="right" style={{ color: '#16A34A' }}>{fmt(informe.reconocer)}</td>
              </tr>
            )}
            {!!informe.totalAnticipos && (
              <tr>
                <td>(-) Anticipos</td>
                <td className="right" style={{ color: '#DC2626' }}>{fmt(informe.totalAnticipos)}</td>
              </tr>
            )}
            <tr>
              <td className="total">Valor final a reconocer</td>
              <td className="right total">{fmt(informe.valorFinal)}</td>
            </tr>
          </tbody>
        </table>

        {/* Notas del auditor */}
        {(informe.pdfData?.notaEjecucionFinanciera || informe.pdfData?.notaAdicional) && (
          <>
            <p className="section-title">Notas del auditor</p>
            {informe.pdfData?.notaEjecucionFinanciera && (
              <div className="nota-box" style={{ marginBottom: 10 }}>
                <p className="nota-label">Nota de ejecución financiera</p>
                <p className="nota-text">{informe.pdfData.notaEjecucionFinanciera}</p>
              </div>
            )}
            {informe.pdfData?.notaAdicional && (
              <div className="nota-box">
                <p className="nota-label">Observaciones adicionales</p>
                <p className="nota-text">{informe.pdfData.notaAdicional}</p>
              </div>
            )}
          </>
        )}

        {/* Firmas */}
        <div className="firmas">
          <div className="firma-line">
            <p style={{ fontWeight: 700 }}>{informe.responsable || 'Auditor responsable'}</p>
            <p style={{ color: '#6B7280', marginTop: 2 }}>Auditor · Dusakawi EPSI</p>
          </div>
          <div className="firma-line">
            <p style={{ fontWeight: 700 }}>{informe.prestador}</p>
            <p style={{ color: '#6B7280', marginTop: 2 }}>Representante Legal</p>
          </div>
        </div>

        {/* Pie de página */}
        <div className="footer">
          <span>Generado el {today} · Plataforma PGP · Dusakawi EPSI</span>
          <span>NIT Prestador: {informe.nit}</span>
        </div>
      </div>
    </>
  );
}
