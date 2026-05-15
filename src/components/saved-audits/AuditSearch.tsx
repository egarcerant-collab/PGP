"use client";

import { Fragment, useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Loader2, Play, RefreshCw, FolderOpen, ChevronDown, ChevronUp, FileText, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SavedAuditData } from '../app/JsonAnalyzerPage';

interface AuditRecord {
    id: number;
    numero: string;
    month: string;
    prestador: string;
    nit: string;
    fecha: string;
    source?: string;
    fsPath?: string;
}

interface InformeVinculado {
    numero: string;
    periodo: string;
    contrato: string;
    total_ejecutado: number;
    descontar: number;
    reconocer: number;
    valor_final: number;
    total_anticipos: number;
    responsable: string;
    pdf_data: { notaEjecucionFinanciera?: string; notaAdicional?: string; [k: string]: any };
}

interface AuditSearchProps {
    onAuditLoad: (auditData: SavedAuditData, prestadorName: string, month: string) => void;
}

const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

// ── Componente separado para evitar el warning de key ──────────────────────
interface InformeCardProps {
    inf: InformeVinculado;
    editingInforme: string | null;
    notaFin: string;
    notaAdi: string;
    savingNota: boolean;
    setEditingInforme: (v: string | null) => void;
    setNotaFin: (v: string) => void;
    setNotaAdi: (v: string) => void;
    handleSaveNotas: (numero: string) => void;
}

function InformeCard({
    inf, editingInforme, notaFin, notaAdi, savingNota,
    setEditingInforme, setNotaFin, setNotaAdi, handleSaveNotas,
}: InformeCardProps) {
    return (
        <div className="bg-white rounded-lg border border-blue-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold bg-blue-600 text-white rounded px-2 py-0.5">
                        Informe N° {inf.numero}
                    </span>
                    <span className="text-xs text-slate-500">Período: <strong>{inf.periodo}</strong></span>
                    {inf.contrato && <span className="text-xs text-slate-500">Contrato: <strong>{inf.contrato}</strong></span>}
                    {inf.responsable && <span className="text-xs text-slate-400">Auditor: {inf.responsable}</span>}
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-50 rounded p-2 text-center">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Ejecutado</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5">{fmt(inf.total_ejecutado)}</p>
                </div>
                <div className="bg-red-50 rounded p-2 text-center">
                    <p className="text-[10px] text-red-400 uppercase font-semibold">A Descontar</p>
                    <p className="text-xs font-bold text-red-600 mt-0.5">{fmt(inf.descontar)}</p>
                </div>
                <div className="bg-emerald-50 rounded p-2 text-center">
                    <p className="text-[10px] text-emerald-500 uppercase font-semibold">A Reconocer</p>
                    <p className="text-xs font-bold text-emerald-700 mt-0.5">{fmt(inf.reconocer)}</p>
                </div>
                <div className="bg-blue-50 rounded p-2 text-center">
                    <p className="text-[10px] text-blue-400 uppercase font-semibold">Valor Final</p>
                    <p className="text-xs font-bold text-blue-700 mt-0.5">{fmt(inf.valor_final)}</p>
                </div>
            </div>
            {editingInforme === inf.numero ? (
                <div className="space-y-2">
                    <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">Nota Ejecución Financiera</label>
                        <textarea
                            value={notaFin}
                            onChange={e => setNotaFin(e.target.value)}
                            rows={3}
                            className="w-full mt-1 text-xs border border-blue-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                            placeholder="Nota de ejecución financiera…"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase">Nota Adicional</label>
                        <textarea
                            value={notaAdi}
                            onChange={e => setNotaAdi(e.target.value)}
                            rows={2}
                            className="w-full mt-1 text-xs border border-blue-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                            placeholder="Nota adicional…"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleSaveNotas(inf.numero)}
                            disabled={savingNota}
                            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-md px-3 py-1.5 transition-colors"
                        >
                            {savingNota ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Guardar notas
                        </button>
                        <button
                            onClick={() => setEditingInforme(null)}
                            className="flex items-center gap-1 border border-slate-200 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-md px-3 py-1.5 transition-colors"
                        >
                            <X className="h-3 w-3" /> Cancelar
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {inf.pdf_data?.notaEjecucionFinanciera && (
                        <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase">Nota Financiera</p>
                            <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{inf.pdf_data.notaEjecucionFinanciera}</p>
                        </div>
                    )}
                    {inf.pdf_data?.notaAdicional && (
                        <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase">Nota Adicional</p>
                            <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{inf.pdf_data.notaAdicional}</p>
                        </div>
                    )}
                    {!inf.pdf_data?.notaEjecucionFinanciera && !inf.pdf_data?.notaAdicional && (
                        <p className="text-xs text-slate-400 italic">Sin notas registradas en este informe.</p>
                    )}
                    <button
                        onClick={() => {
                            setEditingInforme(inf.numero);
                            setNotaFin(inf.pdf_data?.notaEjecucionFinanciera || '');
                            setNotaAdi(inf.pdf_data?.notaAdicional || '');
                        }}
                        className="text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors"
                    >
                        Editar notas
                    </button>
                </div>
            )}
        </div>
    );
}

export default function AuditSearch({ onAuditLoad }: AuditSearchProps) {
    const [audits, setAudits] = useState<AuditRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isContinuing, setIsContinuing] = useState(false);
    const { toast } = useToast();

    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [informesPorAudit, setInformesPorAudit] = useState<Record<number, InformeVinculado[]>>({});
    const [informesLoading, setInformesLoading] = useState<Record<number, boolean>>({});
    const [showCombinedPanel, setShowCombinedPanel] = useState(false);
    const [combinedInformes, setCombinedInformes] = useState<Array<{ auditId: number; month: string; informes: InformeVinculado[] }>>([]);
    const [combinedLoading, setCombinedLoading] = useState(false);
    const [editingInforme, setEditingInforme] = useState<string | null>(null);
    const [notaFin, setNotaFin] = useState('');
    const [notaAdi, setNotaAdi] = useState('');
    const [savingNota, setSavingNota] = useState(false);

    const fetchAudits = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/list-audits');
            const data = await response.json();
            if (Array.isArray(data)) setAudits(data);
        } catch {
            toast({ title: "Error", description: "No se pudieron cargar las auditorías.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => { fetchAudits(); }, [fetchAudits]);

    useEffect(() => {
        setShowCombinedPanel(false);
        setCombinedInformes([]);
    }, [selectedIds]);

    const toggleSelect = (id: number, prestador: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            if (prev.length > 0) {
                const firstPrestador = audits.find(a => a.id === prev[0])?.prestador;
                if (firstPrestador?.toLowerCase() !== prestador.toLowerCase()) {
                    toast({ title: "Mismo prestador", description: "Solo puedes combinar auditorías del mismo prestador.", variant: "destructive" });
                    return prev;
                }
            }
            if (prev.length >= 3) {
                toast({ title: "Máximo 3", description: "Solo puedes cargar hasta 3 auditorías a la vez.", variant: "destructive" });
                return prev;
            }
            return [...prev, id];
        });
    };

    const handleToggleExpand = async (audit: AuditRecord) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(audit.id)) { next.delete(audit.id); return next; }
            next.add(audit.id);
            return next;
        });
        setEditingInforme(null);

        if (informesPorAudit[audit.id] !== undefined) return;

        setInformesLoading(prev => ({ ...prev, [audit.id]: true }));
        try {
            const url = `/api/audit-informe?prestador=${encodeURIComponent(audit.prestador)}&mes=${encodeURIComponent(audit.month)}`;
            const res = await fetch(url);
            const data = await res.json();
            setInformesPorAudit(prev => ({ ...prev, [audit.id]: data.informes || [] }));
        } catch {
            setInformesPorAudit(prev => ({ ...prev, [audit.id]: [] }));
        } finally {
            setInformesLoading(prev => ({ ...prev, [audit.id]: false }));
        }
    };

    const handleShowCombinedInformes = async () => {
        if (selectedIds.length === 0) return;
        if (showCombinedPanel) { setShowCombinedPanel(false); return; }

        setCombinedLoading(true);
        setShowCombinedPanel(true);
        try {
            const results = await Promise.all(
                selectedIds.map(async id => {
                    const audit = audits.find(a => a.id === id)!;
                    if (informesPorAudit[id] !== undefined) {
                        return { auditId: id, month: audit.month, informes: informesPorAudit[id] };
                    }
                    const url = `/api/audit-informe?prestador=${encodeURIComponent(audit.prestador)}&mes=${encodeURIComponent(audit.month)}`;
                    const res = await fetch(url);
                    const data = await res.json();
                    const informes = data.informes || [];
                    setInformesPorAudit(prev => ({ ...prev, [id]: informes }));
                    return { auditId: id, month: audit.month, informes };
                })
            );
            setCombinedInformes(results);
        } catch {
            toast({ title: "Error", description: "No se pudieron cargar los informes.", variant: "destructive" });
        } finally {
            setCombinedLoading(false);
        }
    };

    const handleSaveNotas = async (informeNumero: string) => {
        setSavingNota(true);
        try {
            const res = await fetch('/api/audit-informe', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numero: informeNumero, notaEjecucionFinanciera: notaFin, notaAdicional: notaAdi }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            setInformesPorAudit(prev => {
                const updated = { ...prev };
                for (const auditId in updated) {
                    updated[auditId] = updated[auditId].map(inf =>
                        inf.numero === informeNumero
                            ? { ...inf, pdf_data: { ...inf.pdf_data, notaEjecucionFinanciera: notaFin, notaAdicional: notaAdi } }
                            : inf
                    );
                }
                return updated;
            });
            setCombinedInformes(prev => prev.map(entry => ({
                ...entry,
                informes: entry.informes.map(inf =>
                    inf.numero === informeNumero
                        ? { ...inf, pdf_data: { ...inf.pdf_data, notaEjecucionFinanciera: notaFin, notaAdicional: notaAdi } }
                        : inf
                )
            })));
            toast({ title: "✅ Notas guardadas", description: `Informe N° ${informeNumero} actualizado.` });
            setEditingInforme(null);
        } catch (e: any) {
            toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
        } finally {
            setSavingNota(false);
        }
    };

    const handleLoad = async () => {
        if (selectedIds.length === 0) return;
        setIsContinuing(true);
        try {
            const results = await Promise.all(
                selectedIds.map(id => {
                    const audit = audits.find(a => a.id === id);
                    const url = audit?.fsPath
                        ? `/api/load-audit?fsPath=${encodeURIComponent(audit.fsPath)}`
                        : `/api/load-audit?id=${id}`;
                    return fetch(url).then(r => r.json());
                })
            );

            const base = results[0];
            const merged: SavedAuditData = { ...base.auditData };

            if (results.length > 1) {
                const allExecData: Record<string, any> = { ...(base.auditData.executionData || {}) };
                for (let i = 1; i < results.length; i++) {
                    const other = results[i].auditData?.executionData || {};
                    Object.assign(allExecData, other);
                }
                merged.executionData = allExecData;
            }

            const prestadorName = base.prestador;
            const allMonths = results.map(r => r.mes).join(' + ');
            const hasExecData = merged.executionData && Object.keys(merged.executionData).length > 0;

            if (base.informeRelacionado) {
                merged.informeRestored = {
                    ...base.informeRelacionado,
                    notaEjecucionFinanciera: base.informeRelacionado.notaEjecucionFinanciera
                        || merged.notasGuardadas?.notaEjecucionFinanciera || '',
                    notaAdicional: base.informeRelacionado.notaAdicional
                        || merged.notasGuardadas?.notaAdicional || '',
                    valorCupsInesperadas: base.informeRelacionado.valorCupsInesperadas
                        || (merged.notasGuardadas as any)?.valorCupsInesperadas || 0,
                    cantidadCupsInesperadas: base.informeRelacionado.cantidadCupsInesperadas
                        || (merged.notasGuardadas as any)?.cantidadCupsInesperadas || '',
                };
            } else if (merged.notasGuardadas) {
                merged.informeRestored = {
                    numero: merged.notasGuardadas.informeNum || '',
                    notaEjecucionFinanciera: merged.notasGuardadas.notaEjecucionFinanciera || '',
                    notaAdicional: merged.notasGuardadas.notaAdicional || '',
                    valorCupsInesperadas: (merged.notasGuardadas as any).valorCupsInesperadas || 0,
                    cantidadCupsInesperadas: (merged.notasGuardadas as any).cantidadCupsInesperadas || '',
                };
            }

            onAuditLoad(merged, prestadorName, allMonths);

            if (!hasExecData) {
                toast({
                    title: "⚠️ Auditoría sin datos de ejecución",
                    description: "Esta auditoría fue guardada sin los datos de análisis. Carga los JSON nuevamente, realiza el análisis y guarda de nuevo.",
                    variant: "destructive",
                });
            } else {
                toast({ title: "✅ Auditoría restaurada", description: `${prestadorName} — ${allMonths}` });
            }
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setIsContinuing(false);
        }
    };

    // Props comunes para InformeCard
    const cardProps = { editingInforme, notaFin, notaAdi, savingNota, setEditingInforme, setNotaFin, setNotaAdi, handleSaveNotas };

    const selectedAudits = audits.filter(a => selectedIds.includes(a.id));

    return (
        <div className="space-y-4">
            {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando auditorías desde Supabase...
                </div>
            ) : audits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                    No hay auditorías guardadas. Usa <strong>"Guardar Auditoría"</strong> en el sidebar.
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">
                        Selecciona hasta <strong>3 auditorías del mismo prestador</strong> para combinarlas. Usa <strong>▼</strong> para ver el informe financiero vinculado.
                    </p>
                    <div className="rounded-lg border border-border overflow-auto max-h-[520px]">
                        <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 w-8"></th>
                                    <th className="px-4 py-2 text-left font-semibold">N°</th>
                                    <th className="px-4 py-2 text-left font-semibold">Prestador</th>
                                    <th className="px-4 py-2 text-left font-semibold">NIT</th>
                                    <th className="px-4 py-2 text-left font-semibold">Mes</th>
                                    <th className="px-4 py-2 text-left font-semibold">Fecha</th>
                                    <th className="px-4 py-2 text-center font-semibold">Informe</th>
                                </tr>
                            </thead>
                            <tbody>
                                {audits.map((a) => {
                                    const checked = selectedIds.includes(a.id);
                                    const firstPrestador = selectedIds.length > 0 ? audits.find(x => x.id === selectedIds[0])?.prestador : null;
                                    const disabled = !checked && selectedIds.length >= 3;
                                    const differentPrestador = !checked && firstPrestador && firstPrestador.toLowerCase() !== a.prestador.toLowerCase();
                                    const isExpanded = expandedIds.has(a.id);
                                    const informes = informesPorAudit[a.id] || [];
                                    const loadingInf = informesLoading[a.id];

                                    return (
                                        <Fragment key={a.id}>
                                            <tr
                                                className={`border-t border-border transition-colors ${
                                                    checked
                                                        ? 'bg-emerald-50 border-emerald-200'
                                                        : isExpanded
                                                        ? 'bg-blue-50/40'
                                                        : disabled || differentPrestador
                                                        ? 'opacity-40 cursor-not-allowed'
                                                        : 'hover:bg-muted/40'
                                                }`}
                                            >
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => !disabled && !differentPrestador && toggleSelect(a.id, a.prestador)}
                                                        className="accent-emerald-600 h-4 w-4 cursor-pointer"
                                                        disabled={disabled || !!differentPrestador}
                                                    />
                                                </td>
                                                <td className="px-4 py-2 font-mono text-primary font-bold">{a.numero}</td>
                                                <td className="px-4 py-2 max-w-[180px] truncate">{a.prestador?.toUpperCase()}</td>
                                                <td className="px-4 py-2 text-muted-foreground text-xs">{a.nit}</td>
                                                <td className="px-4 py-2 capitalize">{a.month}</td>
                                                <td className="px-4 py-2 text-muted-foreground text-xs">{a.fecha}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <button
                                                        onClick={() => handleToggleExpand(a)}
                                                        title={isExpanded ? 'Ocultar informe' : 'Ver informe vinculado'}
                                                        className={`inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 transition-colors ${
                                                            isExpanded
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
                                                        }`}
                                                    >
                                                        <FileText className="h-3 w-3" />
                                                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                    </button>
                                                </td>
                                            </tr>

                                            {isExpanded && (
                                                <tr className="border-t border-blue-100 bg-blue-50/30">
                                                    <td colSpan={7} className="px-4 py-3">
                                                        {loadingInf ? (
                                                            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                                                                <Loader2 className="h-3 w-3 animate-spin" /> Buscando informe relacionado…
                                                            </div>
                                                        ) : informes.length === 0 ? (
                                                            <p className="text-xs text-slate-400 italic py-1">
                                                                No se encontró un informe financiero vinculado a esta auditoría ({a.prestador.toUpperCase()} — {a.month}).
                                                            </p>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                {informes.map((inf, i) => (
                                                                    <InformeCard
                                                                        key={inf.numero || String(i)}
                                                                        inf={inf}
                                                                        {...cardProps}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Botones de acción */}
            <div className="flex items-center gap-3 flex-wrap">
                <Button
                    onClick={handleLoad}
                    disabled={selectedIds.length === 0 || isContinuing}
                    className="bg-primary hover:bg-primary/90"
                >
                    {isContinuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    {selectedIds.length === 0
                        ? 'Selecciona una auditoría'
                        : selectedIds.length === 1
                        ? 'Cargar Auditoría'
                        : `Combinar ${selectedIds.length} auditorías`}
                </Button>
                <Button variant="outline" size="icon" onClick={fetchAudits} title="Refrescar lista">
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                {selectedIds.length > 1 && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShowCombinedInformes}
                        className={`flex items-center gap-1.5 text-xs ${showCombinedPanel ? 'bg-blue-50 border-blue-300 text-blue-700' : 'text-slate-600'}`}
                        title="Ver informes financieros de todas las auditorías seleccionadas"
                    >
                        {combinedLoading
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <FileText className="h-3 w-3" />}
                        {showCombinedPanel ? 'Ocultar informes' : `Ver ${selectedIds.length} informes`}
                        {showCombinedPanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                )}
                {selectedAudits.length > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        {selectedAudits[0].prestador?.toUpperCase()} — {selectedAudits.map(a => a.month).join(' + ')}
                    </span>
                )}
            </div>

            {/* Panel combinado */}
            {showCombinedPanel && selectedIds.length > 1 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Informes financieros vinculados — {selectedAudits[0]?.prestador?.toUpperCase()}
                    </h4>
                    {combinedLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500 py-4 justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" /> Cargando informes…
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {combinedInformes.map(entry => (
                                <div key={entry.auditId}>
                                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2 border-b border-blue-100 pb-1">
                                        📅 Mes: <span className="capitalize text-blue-700">{entry.month}</span>
                                    </p>
                                    {entry.informes.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic">
                                            No se encontró informe vinculado para {entry.month}.
                                        </p>
                                    ) : (
                                        <div className="space-y-3">
                                            {entry.informes.map((inf, i) => (
                                                <InformeCard
                                                    key={inf.numero || String(i)}
                                                    inf={inf}
                                                    {...cardProps}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {combinedInformes.length > 1 && (
                                <div className="rounded-lg border border-blue-300 bg-white p-3">
                                    <p className="text-xs font-bold text-blue-800 uppercase mb-2">Totales consolidados ({selectedIds.length} meses)</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {[
                                            { label: 'Total Ejecutado', key: 'total_ejecutado' as const, cls: 'bg-slate-50 text-slate-700' },
                                            { label: 'A Descontar', key: 'descontar' as const, cls: 'bg-red-50 text-red-600' },
                                            { label: 'A Reconocer', key: 'reconocer' as const, cls: 'bg-emerald-50 text-emerald-700' },
                                            { label: 'Valor Final', key: 'valor_final' as const, cls: 'bg-blue-50 text-blue-700' },
                                        ].map(({ label, key, cls }) => {
                                            const total = combinedInformes.reduce((sum, entry) =>
                                                sum + entry.informes.reduce((s, inf) => s + (inf[key] || 0), 0), 0);
                                            return (
                                                <div key={key} className={`rounded p-2 text-center ${cls.split(' ')[0]}`}>
                                                    <p className="text-[10px] text-slate-400 uppercase font-semibold">{label}</p>
                                                    <p className={`text-xs font-bold mt-0.5 ${cls.split(' ')[1]}`}>{fmt(total)}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
