'use client';

import { useEffect, useState } from 'react';
import {
  LogOut, FileText, Download, ShieldCheck, Building2, Calendar,
  DollarSign, ClipboardCheck, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, MessageSquare, Clock, Send,
} from 'lucide-react';

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
  fecha: string;
  responsable: string;
  actaUrl: string | null;
  actaFirmadaUrl: string | null;
  pdfData: { notaEjecucionFinanciera?: string; notaAdicional?: string } | null;
  notaPrestador: string | null;
  estadoPrestador: 'conforme' | 'no_conforme' | null;
  notaPrestadorFecha: string | null;
}

interface User { id: string; nombre: string; rol: string; }

function fmt(n: number | undefined | null) {
  if (!n && n !== 0) return '—';
  return '$' + Math.round(n).toLocaleString('es-CO');
}

function fmtFecha(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const BADGE: Record<string, { bg: string; color: string; label: string; Icon: any }> = {
  conforme:    { bg: '#DCFCE7', color: '#166534', label: 'Conforme',    Icon: CheckCircle2 },
  no_conforme: { bg: '#FEE2E2', color: '#991B1B', label: 'No conforme', Icon: XCircle },
};

export default function PrestadorPage() {
  const [user, setUser] = useState<User | null>(null);
  const [informes, setInformes] = useState<Informe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Estado de notas por informe
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [notaTexts, setNotaTexts] = useState<Record<string, string>>({});
  const [notaEstados, setNotaEstados] = useState<Record<string, 'conforme' | 'no_conforme' | ''>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json();
        if (!meData?.user || !meData?.profile) { window.location.href = '/login'; return; }
        const me: User = { id: meData.user.id, nombre: meData.profile.nombre, rol: meData.profile.rol };
        if (me.rol !== 'prestador') { window.location.href = '/'; return; }
        setUser(me);

        const infRes = await fetch('/api/informes');
        if (!infRes.ok) throw new Error('Error al cargar informes.');
        const data = await infRes.json();
        const list: Informe[] = data.informes ?? [];
        setInformes(list);

        // Inicializar textos/estados con los valores guardados
        const texts: Record<string, string> = {};
        const estados: Record<string, 'conforme' | 'no_conforme' | ''> = {};
        list.forEach(inf => {
          texts[inf.numero] = inf.notaPrestador ?? '';
          estados[inf.numero] = (inf.estadoPrestador as any) ?? '';
        });
        setNotaTexts(texts);
        setNotaEstados(estados);
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

  async function guardarNota(inf: Informe) {
    const estado = notaEstados[inf.numero];
    if (!estado) return;
    setSaving(inf.numero);
    try {
      const res = await fetch('/api/prestador/nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: inf.numero, nota: notaTexts[inf.numero] ?? '', estado }),
      });
      if (!res.ok) throw new Error('Error al guardar.');
      // Actualizar la lista local
      setInformes(prev => prev.map(i =>
        i.numero === inf.numero
          ? { ...i, notaPrestador: notaTexts[inf.numero] ?? '', estadoPrestador: estado, notaPrestadorFecha: new Date().toISOString() }
          : i
      ));
      setSavedOk(inf.numero);
      setTimeout(() => setSavedOk(null), 3000);
    } catch {
      alert('No se pudo guardar la nota. Intente de nuevo.');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f3f4f6' }}>
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-4 rounded-full animate-spin mx-auto"
            style={{ borderColor: `${GREEN} transparent ${GREEN} transparent` }} />
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
          <button onClick={() => window.location.href = '/login'} className="mt-4 text-sm underline text-red-600">
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

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

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Tarjeta de bienvenida */}
        <div className="rounded-xl shadow-sm overflow-hidden" style={{ border: `1px solid ${GREEN}` }}>
          <div className="px-6 py-4" style={{ backgroundColor: GREEN, color: 'white' }}>
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6" />
              <div>
                <h1 className="font-bold text-base">{user?.nombre}</h1>
                <p className="text-green-100 text-xs">NIT: {nit} · Portal de Consulta de Informes</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-3 bg-white flex items-center gap-2 text-xs text-gray-500">
            <ClipboardCheck className="h-4 w-4" style={{ color: GREEN }} />
            Consulta y descarga tus informes de auditoría. Puedes dejar notas de conformidad para tu auditor.
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
                icon: DollarSign, color: GREEN_DARK,
              },
              {
                label: 'Valor Final',
                value: fmt(informes.reduce((s, i) => s + (i.valorFinal || 0), 0)),
                icon: DollarSign, color: '#059669',
              },
              {
                label: 'Período más reciente',
                value: informes[0]?.periodo ?? '—',
                icon: Calendar, color: '#7C3AED',
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
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Informe PDF</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Acta Firmada</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Conformidad</th>
                    <th className="px-4 py-2.5 font-semibold text-gray-600 text-center">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {informes.map((inf, i) => {
                    const isExpanded = expandedRow === inf.numero;
                    const badge = inf.estadoPrestador ? BADGE[inf.estadoPrestador] : null;
                    const estadoLocal = notaEstados[inf.numero] ?? '';
                    const isSaving = saving === inf.numero;
                    const isOk = savedOk === inf.numero;

                    return (
                      <>
                        <tr
                          key={inf.numero}
                          className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                        >
                          <td className="px-4 py-2 font-bold text-gray-700">{inf.numero}</td>
                          <td className="px-4 py-2 text-gray-600">{inf.periodo}</td>
                          <td className="px-4 py-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{
                                backgroundColor:
                                  inf.tipoPeriodo === 'TRIMESTRAL' ? '#DBEAFE'
                                  : inf.tipoPeriodo === 'BIMENSUAL' ? '#EDE9FE'
                                  : GREEN_LIGHT,
                                color:
                                  inf.tipoPeriodo === 'TRIMESTRAL' ? '#1D4ED8'
                                  : inf.tipoPeriodo === 'BIMENSUAL' ? '#6D28D9'
                                  : GREEN_DARK,
                              }}>
                              {inf.tipoPeriodo || 'MENSUAL'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-gray-700">{fmt(inf.totalEjecutado)}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: GREEN_DARK }}>{fmt(inf.valorFinal)}</td>

                          {/* Informe PDF — siempre disponible */}
                          <td className="px-4 py-2 text-center">
                            <a href={`/prestador/pdf/${inf.numero}`} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 transition-colors hover:bg-blue-100">
                              <Download className="h-3 w-3" /> Descargar
                            </a>
                          </td>

                          {/* Acta firmada */}
                          <td className="px-4 py-2 text-center">
                            {inf.actaFirmadaUrl ? (
                              <a href={inf.actaFirmadaUrl} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 transition-colors hover:bg-emerald-100">
                                <Download className="h-3 w-3" /> Descargar
                              </a>
                            ) : <span className="text-gray-300">—</span>}
                          </td>

                          {/* Estado conformidad */}
                          <td className="px-4 py-2 text-center">
                            {badge ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{ backgroundColor: badge.bg, color: badge.color }}>
                                <badge.Icon className="h-3 w-3" />
                                {badge.label}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">
                                <Clock className="h-3 w-3" /> Pendiente
                              </span>
                            )}
                          </td>

                          {/* Botón expandir nota */}
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => setExpandedRow(isExpanded ? null : inf.numero)}
                              className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 border transition-colors"
                              style={{
                                borderColor: isExpanded ? GREEN : '#D1D5DB',
                                color: isExpanded ? GREEN_DARK : '#6B7280',
                                backgroundColor: isExpanded ? GREEN_LIGHT : 'white',
                              }}>
                              <MessageSquare className="h-3 w-3" />
                              {inf.notaPrestador ? 'Ver nota' : 'Dejar nota'}
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                          </td>
                        </tr>

                        {/* Fila expandida: panel de conformidad */}
                        {isExpanded && (
                          <tr key={`nota-${inf.numero}`} className="border-b border-gray-100">
                            <td colSpan={9} className="px-6 py-4" style={{ backgroundColor: '#F0FDF4' }}>
                              <div className="max-w-2xl space-y-3">
                                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                  <MessageSquare className="h-3.5 w-3.5" style={{ color: GREEN }} />
                                  Informe N° {inf.numero} · {inf.periodo}
                                </p>

                                {/* Notas financieras del auditor (solo lectura) */}
                                {(inf.pdfData?.notaEjecucionFinanciera || inf.pdfData?.notaAdicional) && (
                                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
                                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Notas del auditor</p>
                                    {inf.pdfData?.notaEjecucionFinanciera && (
                                      <div>
                                        <p className="text-[10px] font-semibold text-blue-600">Nota de ejecución financiera:</p>
                                        <p className="text-xs text-blue-900 whitespace-pre-wrap">{inf.pdfData.notaEjecucionFinanciera}</p>
                                      </div>
                                    )}
                                    {inf.pdfData?.notaAdicional && (
                                      <div>
                                        <p className="text-[10px] font-semibold text-blue-600">Observaciones adicionales:</p>
                                        <p className="text-xs text-blue-900 whitespace-pre-wrap">{inf.pdfData.notaAdicional}</p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide pt-1">Tu respuesta de conformidad</p>

                                {/* Estado actual */}
                                {inf.estadoPrestador && inf.notaPrestadorFecha && (
                                  <p className="text-[10px] text-gray-400">
                                    Última actualización: {fmtFecha(inf.notaPrestadorFecha)}
                                  </p>
                                )}

                                {/* Selector conformidad */}
                                <div className="flex gap-2">
                                  {[
                                    { val: 'conforme'    as const, label: 'Conforme',    Icon: CheckCircle2, bg: '#DCFCE7', color: '#166534', activeBorder: '#16A34A' },
                                    { val: 'no_conforme' as const, label: 'No conforme', Icon: XCircle,      bg: '#FEE2E2', color: '#991B1B', activeBorder: '#DC2626' },
                                  ].map(opt => {
                                    const active = estadoLocal === opt.val;
                                    return (
                                      <button
                                        key={opt.val}
                                        onClick={() => setNotaEstados(prev => ({ ...prev, [inf.numero]: active ? '' : opt.val }))}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
                                        style={{
                                          borderColor: active ? opt.activeBorder : '#E5E7EB',
                                          backgroundColor: active ? opt.bg : 'white',
                                          color: active ? opt.color : '#6B7280',
                                        }}>
                                        <opt.Icon className="h-3.5 w-3.5" />
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Texto de la nota */}
                                <textarea
                                  rows={3}
                                  placeholder="Escribe tu observación o comentario (opcional)..."
                                  value={notaTexts[inf.numero] ?? ''}
                                  onChange={e => setNotaTexts(prev => ({ ...prev, [inf.numero]: e.target.value }))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
                                />

                                {/* Botón guardar */}
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => guardarNota(inf)}
                                    disabled={!estadoLocal || isSaving}
                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-40"
                                    style={{ backgroundColor: GREEN_DARK }}>
                                    {isSaving ? (
                                      <><div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</>
                                    ) : (
                                      <><Send className="h-3 w-3" /> Enviar al auditor</>
                                    )}
                                  </button>
                                  {isOk && (
                                    <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Nota enviada correctamente
                                    </span>
                                  )}
                                  {!estadoLocal && (
                                    <span className="text-[10px] text-gray-400">Selecciona Conforme o No conforme para enviar</span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
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
