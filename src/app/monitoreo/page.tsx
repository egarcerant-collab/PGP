'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, CheckCircle2, XCircle, Clock,
  ArrowLeft, Building2, MapPin, Search, ExternalLink, Calendar, Play,
  ClipboardList, X, FileJson, ChevronRight,
} from 'lucide-react';
import { CONTRATOS_PGP } from '@/lib/contratos-pgp';

// ─── Helpers de periodo ───────────────────────────────────────────────────────

const MESES_ES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

/** Convierte un periodo almacenado ("ENERO", "ENERO-FEBRERO-MARZO") a meses YYYY-MM */
function periodoToMeses(periodo: string, year = 2026): string[] {
  return periodo.split('-').flatMap(p => {
    const n = MESES_ES[p.trim().toUpperCase()];
    return n ? [`${year}-${String(n).padStart(2, '0')}`] : [];
  });
}

/** Dado un array de informes, devuelve el Set de meses YYYY-MM ya auditados */
function mesesAuditadosDeInformes(informes: any[], year = 2026): Set<string> {
  const set = new Set<string>();
  for (const inf of informes) {
    for (const m of periodoToMeses(inf.periodo ?? '', year)) set.add(m);
  }
  return set;
}

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
  mesesCargados: string[];
  mesesEsperados: string[];
  archivosDescargados?: number;
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

function mesLabel(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1, 1).toLocaleString('es-CO', { month: 'short' }).replace('.', '') + ' ' + y.slice(2);
}

function CoberturaBar({ mesesCargados, mesesEsperados }: { mesesCargados: string[]; mesesEsperados: string[] }) {
  const esperados = mesesEsperados ?? [];
  const cargados = mesesCargados ?? [];
  if (!esperados.length) return null;
  const cargadoSet = new Set(cargados);
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {esperados.map(m => {
        const ok = cargadoSet.has(m);
        return (
          <span
            key={m}
            title={ok ? `${m} — RIPS recibido` : `${m} — pendiente (2 JSON: subsidiado + contributivo)`}
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
              ok
                ? 'bg-green-100 text-green-800 border-green-300'
                : 'bg-red-50 text-red-600 border-red-200'
            }`}
          >
            {mesLabel(m)}
          </span>
        );
      })}
    </div>
  );
}

interface EvaluarModal {
  contrato: string;
  prestador: string;
  nit: string;
  mesesDisponibles: string[]; // YYYY-MM pendientes de evaluación
  mesesYaAuditados: string[];
}

export default function MonitoreoPage() {
  const router = useRouter();
  const [estados, setEstados] = useState<EstadoContrato[]>([]);
  const [loading, setLoading] = useState(false);
  const [consultando, setConsultando] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  // Informes ya auditados por NIT
  const [informesPorNit, setInformesPorNit] = useState<Record<string, any[]>>({});
  const [evalModal, setEvalModal] = useState<EvaluarModal | null>(null);
  const [cargandoPendientes, setCargandoPendientes] = useState(false);

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

  // Cargar informes auditados agrupados por NIT
  useEffect(() => {
    fetch('/api/informes')
      .then(r => r.ok ? r.json() : { informes: [] })
      .then(data => {
        const grouped: Record<string, any[]> = {};
        for (const inf of data.informes ?? []) {
          const nit = (inf.nit ?? '').replace(/\D/g, '');
          if (!nit) continue;
          if (!grouped[nit]) grouped[nit] = [];
          grouped[nit].push(inf);
        }
        setInformesPorNit(grouped);
      })
      .catch(() => {});
  }, []);

  const openEvalModal = (c: { contrato: string; prestador: string; nit: string; estado: EstadoContrato | null }) => {
    const est = c.estado;
    if (!est?.hayRips) return;
    const nit = c.nit.replace(/\D/g, '');
    const mesesYaAuditados = [...mesesAuditadosDeInformes(informesPorNit[nit] ?? [])];
    const mesesDisponibles = (est.mesesCargados ?? []).filter(m => !mesesYaAuditados.includes(m));
    setEvalModal({
      contrato: c.contrato,
      prestador: c.prestador,
      nit: c.nit,
      mesesDisponibles,
      mesesYaAuditados,
    });
  };

  const irAlAnalizador = async (modal: EvaluarModal) => {
    setCargandoPendientes(true);
    try {
      // Guardar contexto en sessionStorage para que JsonAnalyzerPage filtre automáticamente
      sessionStorage.setItem('sie_evaluar', JSON.stringify({
        nit: modal.nit,
        meses: modal.mesesDisponibles,
        prestador: modal.prestador,
        contrato: modal.contrato,
      }));
      router.push('/');
    } catch {
      router.push('/');
    } finally {
      setCargandoPendientes(false);
      setEvalModal(null);
    }
  };

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
        'ok'
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

  const contratoMap = new Map(CONTRATOS_PGP.map(c => [c.contrato, c]));

  const contratos = CONTRATOS_PGP.map(c => {
    const est = estados.find(e => e.contrato === c.contrato);
    return { ...c, estado: est ?? null };
  });

  const totalConRips = contratos.filter(c => c.estado?.hayRips).length;
  const totalSinRips = contratos.filter(c => c.estado && !c.estado.hayRips).length;
  const totalSinConsultar = contratos.filter(c => !c.estado).length;

  // Resumen global de cobertura mensual
  const totalMesesEsperados = contratos.reduce((acc, c) => acc + (c.estado?.mesesEsperados?.length ?? 0), 0);
  const totalMesesCargados = contratos.reduce((acc, c) => acc + ((c.estado?.mesesCargados ?? []).length), 0);

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
        <div className="flex items-center gap-2">
          <button
            onClick={cargarEstado}
            disabled={loading}
            title="Recargar estado guardado"
            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={consultarTodos}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors shadow"
          >
            <Play className={`w-4 h-4 ${loading ? 'hidden' : ''}`} />
            <RefreshCw className={`w-4 h-4 animate-spin ${loading ? '' : 'hidden'}`} />
            {loading ? 'Ejecutando...' : 'Ejecutar consulta SIE'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Resumen */}
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-5xl">
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
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">
            {totalMesesEsperados > 0 ? `${totalMesesCargados}/${totalMesesEsperados}` : '—'}
          </p>
          <p className="text-xs text-blue-600 mt-1">Meses-mes cubiertos</p>
        </div>
      </div>

      {/* Modal de evaluación */}
      {evalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b">
              <div>
                <h2 className="font-bold text-gray-900 text-base">Evaluar RIPS</h2>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{evalModal.prestador}</p>
                <p className="text-xs font-mono text-gray-400">{evalModal.contrato}</p>
              </div>
              <button onClick={() => setEvalModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="p-5 space-y-4">
              {/* Meses disponibles */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <FileJson className="w-3.5 h-3.5 text-blue-500" />
                  RIPS disponibles en SIE ({evalModal.mesesDisponibles.length} mes{evalModal.mesesDisponibles.length !== 1 ? 'es' : ''})
                </p>
                {evalModal.mesesDisponibles.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {evalModal.mesesDisponibles.map(m => (
                      <span key={m} className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                        {mesLabel(m)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Sin meses pendientes de evaluar</p>
                )}
              </div>

              {/* Meses ya auditados */}
              {evalModal.mesesYaAuditados.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    Ya auditados ({evalModal.mesesYaAuditados.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {evalModal.mesesYaAuditados.map(m => (
                      <span key={m} className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                        {mesLabel(m)} ✓
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500">
                Al abrir el analizador se cargarán automáticamente los archivos RIPS pendientes para este contrato.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 pb-5">
              <button
                onClick={() => setEvalModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => irAlAnalizador(evalModal)}
                disabled={cargandoPendientes}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {cargandoPendientes
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <ChevronRight className="w-4 h-4" />}
                Abrir en Analizador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de contratos */}
      <div className="px-6 pb-8 space-y-3 max-w-5xl">
        {contratos.map((c) => {
          const est = c.estado;
          const cargando = consultando === c.contrato;
          const infoBase = contratoMap.get(c.contrato);
          const mesesPendientes = est
            ? (est.mesesEsperados ?? []).filter(m => !(est.mesesCargados ?? []).includes(m))
            : [];

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
                    {/* Badge de meses faltantes */}
                    {mesesPendientes.length > 0 && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium bg-orange-50 text-orange-700 border-orange-200">
                        <Calendar className="w-3 h-3" />
                        {mesesPendientes.length} mes{mesesPendientes.length > 1 ? 'es' : ''} pendiente{mesesPendientes.length > 1 ? 's' : ''}
                      </span>
                    )}
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

                  {/* Barra de cobertura mensual */}
                  {est && (est.mesesEsperados ?? []).length > 0 && (
                    <CoberturaBar
                      mesesCargados={est.mesesCargados ?? []}
                      mesesEsperados={est.mesesEsperados ?? []}
                    />
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {est?.hayRips && (
                    <button
                      onClick={() => openEvalModal(c)}
                      title="Evaluar RIPS en el analizador"
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      Evaluar
                    </button>
                  )}
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
                      {(est.mesesCargados ?? []).length > 0 && (
                        <span className="text-green-600">
                          {est.mesesCargados.length} mes(es) con datos
                        </span>
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
