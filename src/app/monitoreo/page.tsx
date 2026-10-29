'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle,
  ArrowLeft, Building2, MapPin, Search, ExternalLink,
} from 'lucide-react';
import { CONTRATOS_PGP } from '@/lib/contratos-pgp';

interface EstadoContrato {
  contrato: string;
  prestador: string;
  nit: string;
  ciudad: string;
  departamento: string;
  hayRips: boolean;
  totalRegistros: number;
  estados: string[];
  ultimaConsulta: string;
  ultimaRadicacion: string | null;
}

const ESTADO_COLORS: Record<string, string> = {
  Radicado: 'bg-green-100 text-green-800 border-green-200',
  Recepcionado: 'bg-blue-100 text-blue-800 border-blue-200',
  'Pre Radicado': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Devuelto: 'bg-red-100 text-red-800 border-red-200',
  Gestionado: 'bg-purple-100 text-purple-800 border-purple-200',
  'Error de consulta': 'bg-gray-100 text-gray-600 border-gray-200',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtCOP(val: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
}

export default function MonitoreoPage() {
  const router = useRouter();
  const [estados, setEstados] = useState<EstadoContrato[]>([]);
  const [loading, setLoading] = useState(false);
  const [consultando, setConsultando] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const cargarEstado = useCallback(async () => {
    try {
      const res = await fetch('/api/sie/monitoreo');
      if (!res.ok) return;
      const data = await res.json();
      if (data.estados?.length) {
        setEstados(data.estados);
        setLastUpdate(new Date().toISOString());
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { cargarEstado(); }, [cargarEstado]);

  const consultarTodos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sie/monitoreo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setEstados(data.resultados ?? []);
      setLastUpdate(new Date().toISOString());
      const nuevas = data.nuevasRadicaciones?.length ?? 0;
      showToast(
        nuevas > 0
          ? `✅ ${nuevas} nueva(s) radicación(es) detectada(s)`
          : `Consulta completada — sin cambios nuevos`,
        nuevas > 0 ? 'ok' : 'ok'
      );
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'err');
    } finally {
      setLoading(false);
    }
  };

  const consultarUno = async (contrato: string) => {
    setConsultando(contrato);
    try {
      const res = await fetch('/api/sie/monitoreo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contrato }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setEstados(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(e => e.contrato === contrato);
        const nuevo = data.resultados?.[0];
        if (nuevo) {
          if (idx >= 0) updated[idx] = nuevo;
          else updated.push(nuevo);
        }
        return updated;
      });
      showToast('Consulta actualizada', 'ok');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'err');
    } finally {
      setConsultando(null);
    }
  };

  // Enriquecer con info del contrato base
  const contratoMap = new Map(CONTRATOS_PGP.map(c => [c.contrato, c]));

  // Contratos sin estado aún (no consultados)
  const contratos = CONTRATOS_PGP.map(c => {
    const est = estados.find(e => e.contrato === c.contrato);
    return { ...c, estado: est ?? null };
  });

  const totalConRips = contratos.filter(c => c.estado?.hayRips).length;
  const totalSinRips = contratos.filter(c => c.estado && !c.estado.hayRips).length;
  const totalSinConsultar = contratos.filter(c => !c.estado).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Monitoreo RIPS — SIE</h1>
          <p className="text-xs text-gray-500">
            {lastUpdate ? `Última actualización: ${fmtDate(lastUpdate)}` : 'Sin consultas aún'}
          </p>
        </div>
        <button
          onClick={consultarTodos}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Consultando...' : 'Consultar todos'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Resumen */}
      <div className="px-6 py-4 grid grid-cols-3 gap-4 max-w-4xl">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{totalConRips}</p>
          <p className="text-xs text-green-600 mt-1">Con RIPS radicados</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{totalSinRips}</p>
          <p className="text-xs text-red-600 mt-1">Sin radicación aún</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-600">{totalSinConsultar}</p>
          <p className="text-xs text-gray-500 mt-1">Sin consultar</p>
        </div>
      </div>

      {/* Tabla de contratos */}
      <div className="px-6 pb-8 space-y-3 max-w-5xl">
        {contratos.map((c) => {
          const est = c.estado;
          const cargando = consultando === c.contrato;
          const infoBase = contratoMap.get(c.contrato);

          return (
            <div
              key={c.contrato}
              className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${est?.hayRips ? 'border-green-200' : est ? 'border-red-100' : 'border-gray-200'}`}
            >
              {/* Cabecera */}
              <div className="flex items-start gap-4 p-4">
                <div className="mt-0.5">
                  {!est ? (
                    <Clock className="w-5 h-5 text-gray-400" />
                  ) : est.hayRips ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {c.contrato}
                    </span>
                    {est?.estados.map(e => (
                      <span key={e} className={`text-xs px-2 py-0.5 rounded border font-medium ${ESTADO_COLORS[e] ?? 'bg-gray-100 text-gray-600'}`}>
                        {e}
                      </span>
                    ))}
                  </div>
                  <p className="font-semibold text-gray-900 mt-1 truncate">{c.prestador}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> NIT {c.nit}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {c.ciudad}, {c.departamento}
                    </span>
                  </div>
                  {infoBase && (
                    <p className="text-xs text-gray-400 mt-1">
                      {c.meses} meses · {fmtCOP(c.valorMensual)}/mes · {c.poblacion.toLocaleString('es-CO')} personas
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => consultarUno(c.contrato)}
                    disabled={cargando || loading}
                    title="Consultar en SIE"
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {cargando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                  {c.webSheet && (
                    <a href={c.webSheet} target="_blank" rel="noopener noreferrer" title="Abrir Sheet del prestador">
                      <ExternalLink className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors" />
                    </a>
                  )}
                </div>
              </div>

              {/* Detalle si hay radicaciones */}
              {est && (
                <div className={`border-t px-4 py-2 text-xs flex items-center gap-4 ${est.hayRips ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                  {est.hayRips ? (
                    <>
                      <span className="font-semibold">{est.totalRegistros} registro(s) en SIE</span>
                      {est.ultimaRadicacion && (
                        <span>Última recepción: {est.ultimaRadicacion.slice(0, 10)}</span>
                      )}
                    </>
                  ) : (
                    <span>Sin radicaciones en el SIE para este contrato</span>
                  )}
                  <span className="ml-auto text-gray-400">Consultado: {fmtDate(est.ultimaConsulta)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
