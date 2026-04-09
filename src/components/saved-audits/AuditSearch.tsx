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
    const [selectedId, setSelectedId] = useState<number | null>(null);
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

    const handleLoad = async () => {
        if (!selectedId) return;
        const audit = audits.find(a => a.id === selectedId);
        if (!audit) return;
        setIsContinuing(true);
        try {
            const res = await fetch(`/api/load-audit?id=${selectedId}`);
            if (!res.ok) throw new Error('Error al cargar la auditoría.');
            const { auditData, prestador, mes } = await res.json();
            onAuditLoad(auditData, prestador, mes);
            toast({ title: "Auditoría restaurada", description: `${prestador} — ${mes}` });
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
            if (selectedId === deletingId) setSelectedId(null);
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setDeletingId(null); setPwInput(''); setPwError(false);
        }
    };

    return (
        <div className="space-y-4">
            {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando auditorías desde Supabase...
                </div>
            ) : audits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                    No hay auditorías guardadas. Usa <strong>"Guardar Auditoría"</strong> en el módulo <strong>Descuentos y Ajustes</strong>.
                </div>
            ) : (
                <div className="rounded-lg border border-border overflow-auto max-h-96">
                    <table className="w-full text-sm">
                        <thead className="bg-muted sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold">N°</th>
                                <th className="px-4 py-2 text-left font-semibold">Prestador</th>
                                <th className="px-4 py-2 text-left font-semibold">NIT</th>
                                <th className="px-4 py-2 text-left font-semibold">Mes</th>
                                <th className="px-4 py-2 text-left font-semibold">Fecha</th>
                                <th className="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {audits.map(a => (
                                <tr
                                    key={a.id}
                                    onClick={() => setSelectedId(a.id)}
                                    className={`border-t border-border cursor-pointer transition-colors ${selectedId === a.id ? 'bg-primary/10 font-semibold' : 'hover:bg-muted/40'}`}
                                >
                                    <td className="px-4 py-2 font-mono text-primary font-bold">{a.numero}</td>
                                    <td className="px-4 py-2 max-w-[200px] truncate">{a.prestador?.toUpperCase()}</td>
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
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleLoad} disabled={!selectedId || isContinuing} className="bg-primary hover:bg-primary/90">
                    {isContinuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    {selectedId ? 'Cargar Auditoría Seleccionada' : 'Selecciona una fila'}
                </Button>
                <Button variant="outline" size="icon" onClick={fetchAudits} title="Refrescar lista">
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                {selectedId && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        {audits.find(a => a.id === selectedId)?.prestador?.toUpperCase()} — {audits.find(a => a.id === selectedId)?.month}
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
