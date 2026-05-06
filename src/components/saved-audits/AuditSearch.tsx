"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Play, RefreshCw, FolderOpen, Trash2, Eraser, ChevronDown, ChevronUp, FileText, Save, X } from "lucide-react";
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

export default function AuditSearch({ onAuditLoad }: AuditSearchProps) {
    const [audits, setAudits] = useState<AuditRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isContinuing, setIsContinuing] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [deleteAll, setDeleteAll] = useState(false);
    const [pwInput, setPwInput] = useState('');
    const [pwError, setPwError] = useState(false);
    const { toast } = useToast();

    // ── Informes vinculados ──
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [informesPorAudit, setInformesPorAudit] = useState<Record<number, InformeVinculado[]>>({});
    const [informesLoading, setInformesLoading] = useState<Record<number, boolean>>({});
    // Edición de notas
    const [editingInfomre, setEditingInforme] = useState<string | null>(null); // numero del informe
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

    // ── Cargar informe vinculado al expandir una fila ──
    const handleToggleExpand = async (audit: AuditRecord) => {
        if (expandedId === audit.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(audit.id);
        setEditingInforme(null);

        if (informesPorAudit[audit.id]) return; // ya cargado

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

    // ── Guardar notas editadas ──
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

            // Actualizar local
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

            // Si la primera auditoría tiene un informe vinculado, incluirlo
            if (base.informeRelacionado) {
                merged.informeRestored = base.informeRelacionado;
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

    const handleDeleteConfirm = async () => {
        if (pwInput !== '123456') { setPwError(true); return; }
        try {
            if (deleteAll) {
                const res = await fetch(`/api/save-audit?id=ALL&password=${pwInput}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Error al eliminar.');
                toast({ title: "Todas las auditorías eliminadas" });
                setAudits([]);
                setSelectedIds([]);
            } else {
                const audit = audits.find(a => a.id === deletingId);
                const fsPath = audit?.fsPath ? `&fsPath=${encodeURIComponent(audit.fsPath)}` : '';
                const res = await fetch(`/api/save-audit?id=${deletingId}&password=${pwInput}${fsPath}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Error al eliminar.');
                toast({ title: "Auditoría eliminada" });
                setAudits(prev => prev.filter(a => a.id !== deletingId));
                setSelectedIds(prev => prev.filter(x => x !== deletingId));
            }
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setDeletingId(null); setDeleteAll(false); setPwInput(''); setPwError(false);
        }
    };

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
                                    <th className="px-4 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {audits.map((a, idx) => {
                                    const checked = selectedIds.includes(a.id);
                                    const firstPrestador = selectedIds.length > 0 ? audits.find(x => x.id === selectedIds[0])?.prestador : null;
                                    const disabled = !checked && selectedIds.length >= 3;
                                    const differentPrestador = !checked && firstPrestador && firstPrestador.toLowerCase() !== a.prestador.toLowerCase();
                                    const isExpanded = expandedId === a.id;
                                    const informes = informesPorAudit[a.id] || [];
                                    const loadingInf = informesLoading[a.id];

                                    return (
                                        <>
                                            <tr
                                                key={`row-${a.id}-${idx}`}
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
                                                <td className="px-4 py-2">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); setDeletingId(a.id); setPwInput(''); setPwError(false); }}
                                                        className="text-red-400 hover:text-red-600 transition-colors"
                                                        title="Eliminar auditoría"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* Panel de informe vinculado */}
                                            {isExpanded && (
                                                <tr key={`inf-${a.id}`} className="border-t border-blue-100 bg-blue-50/30">
                                                    <td colSpan={8} className="px-4 py-3">
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
                                                                {informes.map(inf => (
                                                                    <div key={inf.numero} className="bg-white rounded-lg border border-blue-100 shadow-sm p-4 space-y-3">
                                                                        {/* Cabecera del informe */}
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

                                                                        {/* Totales financieros */}
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

                                                                        {/* Notas */}
                                                                        {editingInfomre === inf.numero ? (
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
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

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
                {audits.length > 0 && (
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => { setDeleteAll(true); setDeletingId(null); setPwInput(''); setPwError(false); }}
                        title="Eliminar todas las auditorías"
                        className="text-red-500 hover:text-red-700 hover:border-red-400"
                    >
                        <Eraser className="h-4 w-4" />
                    </Button>
                )}
                {selectedAudits.length > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        {selectedAudits[0].prestador?.toUpperCase()} — {selectedAudits.map(a => a.month).join(' + ')}
                    </span>
                )}
            </div>

            {/* Modal eliminar con contraseña */}
            {(deletingId || deleteAll) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
                        <h3 className="font-semibold text-base">
                            🔒 {deleteAll ? 'Eliminar TODAS las auditorías' : `Eliminar Auditoría N° ${audits.find(a => a.id === deletingId)?.numero}`}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            {deleteAll
                                ? `Se eliminarán ${audits.length} registros permanentemente.`
                                : `${audits.find(a => a.id === deletingId)?.prestador?.toUpperCase()} — ${audits.find(a => a.id === deletingId)?.month}`}
                        </p>
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
                            <Button variant="outline" size="sm" onClick={() => { setDeletingId(null); setDeleteAll(false); setPwInput(''); setPwError(false); }}>
                                Cancelar
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
                                Eliminar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
