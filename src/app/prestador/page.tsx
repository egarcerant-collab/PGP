'use client';

import { useEffect, useState } from 'react';
import { LogOut, FileText, Download, ShieldCheck, Building2, Calendar, DollarSign, ClipboardCheck } from 'lucide-react';

const GREEN = '#4CAF50';
const GREEN_DARK = '#2E7D32';
const GREEN_LIGHT = '#E8F5E9';

interface Informe {
  numero: string;
  prestador: string;
  nit: string;
  periodo: string;
  tipoPeriodo: string;
  totalEjecutado: number;
  valorFinal: number;
  descontar: number;
  reconocer: number;
  fecha: string;
  responsable: string;
  actaUrl: string | null;
  actaFirmadaUrl: string | null;
}

interface User {
  id: string;
  nombre: string;
  rol: string;
}

function fmt(n: number | undefined | null) {
  if (!n && n !== 0) return '—';
  return '$' + Math.round(n).toLocaleString('es-CO');
}

export default function PrestadorPage() {
  const [user, setUser] = useState<User | null>(null);
  const [informes, setInformes] = useState<Informe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // Verificar sesión
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json();
        if (!meData?.user || !meData?.profile) { window.location.href = '/login'; return; }
        const me: User = { id: meData.user.id, nombre: meData.profile.nombre, rol: meData.profile.rol };
        if (me.rol !== 'prestador') { window.location.href = '/'; return; }
        setUser(me);

        // Cargar informes propios
        const infRes = await fetch('/api/informes');
        if (!infRes.ok) throw new Error('Error al cargar informes.');
        const data = await infRes.json();
        setInformes(data.informes ?? []);
      } catch (e: any) {
        setError(e.message || 'Error de conexión.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f3f4f6' }}>
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-4 rounded-full animate-spin mx-auto" style={{ borderColor: `${GREEN} transparent ${GREEN} transparent` }} />
          <p className="text-sm text-gray-500">Cargando información...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f3f4f6' }}>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-md">
          <p className="text-red-700 font-medium">{error}</p>
          <button onClick={() => window.location.href = '/login'} className="mt-4 text-sm underline text-red-600">Volver al inicio</button>
        </div>
      </div>
    );
  }

  const prestadorNombre = user?.nombre ?? '';
  const nit = user?.id ?? '';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f3f4f6' }}>
      {/* Barra superior */}
      <div className="w-full py-3 px-6 flex items-center justify-between shadow-md" style={{ backgroundColor: GREEN_DARK }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center shrink-0" style={{ color: GREEN_DARK }}>
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="text-white font-semibold text-sm tracking-wide">
            ASOCIACIÓN DE CABILDOS INDÍGENAS DEL CESAR Y LA GUAJIRA
          </span>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10">
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Tarjeta de bienvenida */}
        <div className="rounded-xl shadow-sm overflow-hidden" style={{ border: `1px solid ${GREEN}` }}>
          <div className="px-6 py-4" style={{ backgroundColor: GREEN, color: 'white' }}>
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6" />
              <div>
                <h1 className="font-bold text-base">{prestadorNombre}</h1>
                <p className="text-green-100 text-xs">NIT: {nit} · Portal de Consulta de Informes</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-3 bg-white flex items-center gap-2 text-xs text-gray-500">
            <ClipboardCheck className="h-4 w-4" style={{ color: GREEN }} />
            Aquí puedes consultar y descargar los informes de auditoría de tus servicios con Dusakawi EPSI.
          </div>
        </div>

        {/* Resumen */}
        {informes.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Informes', value: informes.length, icon: FileText, color: '#3B82F6' },
              {
                label: 'Total Ejecutado',
                value: fmt(informes.reduce((s, i) => s + (i.totalEjecutado || 0), 0)),
                icon: DollarSign,
                color: GREEN_DARK,
              },
              {
                label: 'Valor Final',
                value: fmt(informes.reduce((s, i) => s + (i.valorFinal || 0), 0)),
                icon: DollarSign,
                color: '#059669',
              },
              {
                label: 'Período más reciente',
                value: informes[0]?.periodo ?? '—',
                icon: Calendar,
                color: '#7C3AED',
              },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <card.icon className="h-5 w-5 mb-1" style={{ color: card.color }} />
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{card.label}</p>
                <p className="text-sm font-bold text-gray-800 mt-0.5 leading-tight">{card.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabla de informes */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: GREEN }} />
            <h2 className="font-semibold text-sm text-gray-700">Informes de Auditoría</h2>
            <span className="ml-auto text-xs text-gray-400">{informes.length} registros</span>
          </div>

          {informes.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText className="h-10 w-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">No hay informes registrados para este prestador.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left" style={{ backgroundColor: GREEN_LIGHT }}>
                    <th className="px-4 py-2.5 font-semibold text-gray-600">N°</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600">Período</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600">Tipo</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-right">Total Ejecutado</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-right">Valor Final</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Acta</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Acta Firmada</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600">Auditor</th>
                  </tr>
                </thead>
                <tbody>
                  {informes.map((inf, i) => (
                    <tr key={inf.numero} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-2 font-bold text-gray-700">{inf.numero}</td>
                      <td className="px-4 py-2 text-gray-600">{inf.periodo}</td>
                      <td className="px-4 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            backgroundColor: inf.tipoPeriodo === 'TRIMESTRAL' ? '#DBEAFE' : inf.tipoPeriodo === 'BIMENSUAL' ? '#EDE9FE' : GREEN_LIGHT,
                            color: inf.tipoPeriodo === 'TRIMESTRAL' ? '#1D4ED8' : inf.tipoPeriodo === 'BIMENSUAL' ? '#6D28D9' : GREEN_DARK,
                          }}>
                          {inf.tipoPeriodo || 'MENSUAL'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-700">{fmt(inf.totalEjecutado)}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: GREEN_DARK }}>{fmt(inf.valorFinal)}</td>
                      <td className="px-4 py-2 text-center">
                        {inf.actaUrl ? (
                          <a href={inf.actaUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                            <Download className="h-3 w-3" /> Ver
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {inf.actaFirmadaUrl ? (
                          <a href={inf.actaFirmadaUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                            <Download className="h-3 w-3" /> Ver
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-500 max-w-[140px] truncate">{inf.responsable || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-400">
          Plataforma PGP · Dusakawi EPSI · Solo consulta — Para correcciones contacte al auditor responsable.
        </p>
      </div>
    </div>
  );
}
