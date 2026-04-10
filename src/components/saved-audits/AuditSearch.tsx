"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Play, RefreshCw, FolderOpen, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SavedAuditData } from '../app/JsonAnalyzerPage';

interface AuditRecord {
    id: number;
    numero: string;
    month: string;
    prestador: string;
    nit: string;
    fecha: string;
}

interface AuditSearchProps {
    onAuditLoad: (auditData: SavedAuditData, prestadorName: string, month: string) => void;
}

export default function AuditSearch({ onAuditLoad }: AuditSearchProps) {
    const [audits, setAudits] = useState<AuditRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isContinuing, setIsContinuing] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [pwInput, setPwInput] = useState('');
    const [pwError, setPwError] = useState(false);
    const { toast } = useToast();

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
            // Validar mismo prestador
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

    const handleLoad = async () => {
        if (selectedIds.length === 0) return;
        setIsContinuing(true);
        try {
            // Cargar todas las auditorías seleccionadas en paralelo
            const results = await Promise.all(
                selectedIds.map(id => fetch(`/api/load-audit?id=${id}`).then(r => r.json()))
            );

            // Tomar datos base de la primera
            const base = results[0];
            const merged: SavedAuditData = { ...base.auditData };

            // Combinar executionData de todas
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

            onAuditLoad(merged, prestadorName, allMonths);
            toast({ title: "Auditoría restaurada", description: `${prestadorName} — ${allMonths}` });
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setIsContinuing(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (pwInput !== '123456') { setPwError(true); return; }
        try {
            const res = await fetch(`/api/save-audit?id=${deletingId}&password=${pwInput}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error al eliminar.');
            toast({ title: "Auditoría eliminada" });
            setAudits(prev => prev.filter(a => a.id !== deletingId));
            setSelectedIds(prev => prev.filter(x => x !== deletingId));
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setDeletingId(null); setPwInput(''); setPwError(false);
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
                        Selecciona hasta <strong>3 auditorías del mismo prestador</strong> para combinarlas al cargar.
                    </p>
                    <div className="rounded-lg border border-border overflow-auto max-h-96">
                        <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 w-8"></th>
                                    <th className="px-4 py-2 text-left font-semibold">N°</th>
                                    <th className="px-4 py-2 text-left font-semibold">Prestador</th>
                                    <th className="px-4 py-2 text-left font-semibold">NIT</th>
                                    <th className="px-4 py-2 text-left font-semibold">Mes</th>
                                    <th className="px-4 py-2 text-left font-semibold">Fecha</th>
                                    <th className="px-4 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {audits.map((a, idx) => {
                                    const checked = selectedIds.includes(a.id);
                                    const firstPrestador = selectedIds.length > 0 ? audits.find(x => x.id === selectedIds[0])?.prestador : null;
                                    const disabled = !checked && selectedIds.length >= 3;
                                    const differentPrestador = !checked && firstPrestador && firstPrestador.toLowerCase() !== a.prestador.toLowerCase();
                                    return (
                                        <tr
                                            key={`${a.id}-${idx}`}
                                            onClick={() => !disabled && toggleSelect(a.id, a.prestador)}
                                            className={`border-t border-border transition-colors ${
                                                checked
                                                    ? 'bg-emerald-50 border-emerald-200'
                                                    : disabled || differentPrestador
                                                    ? 'opacity-40 cursor-not-allowed'
                                                    : 'cursor-pointer hover:bg-muted/40'
                                            }`}
                                        >
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => !disabled && toggleSelect(a.id, a.prestador)}
                                                    className="accent-emerald-600 h-4 w-4"
                                                    disabled={disabled || !!differentPrestador}
                                                />
                                            </td>
                                            <td className="px-4 py-2 font-mono text-primary font-bold">{a.numero}</td>
                                            <td className="px-4 py-2 max-w-[180px] truncate">{a.prestador?.toUpperCase()}</td>
                                            <td className="px-4 py-2 text-muted-foreground text-xs">{a.nit}</td>
                                            <td className="px-4 py-2 capitalize">{a.month}</td>
                                            <td className="px-4 py-2 text-muted-foreground text-xs">{a.fecha}</td>
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
                {selectedAudits.length > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        {selectedAudits[0].prestador?.toUpperCase()} — {selectedAudits.map(a => a.month).join(' + ')}
                    </span>
                )}
            </div>

            {/* Modal eliminar con contraseña */}
            {deletingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
                        <h3 className="font-semibold text-base">
                            🔒 Eliminar Auditoría N° {audits.find(a => a.id === deletingId)?.numero}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            {audits.find(a => a.id === deletingId)?.prestador?.toUpperCase()} — {audits.find(a => a.id === deletingId)?.month}
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
                            <Button variant="outline" size="sm" onClick={() => { setDeletingId(null); setPwInput(''); setPwError(false); }}>
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
