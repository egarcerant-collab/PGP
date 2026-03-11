
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Play, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import type { SavedAuditData } from '../app/JsonAnalyzerPage';

interface AuditFile {
    id: string;
    month: string;
    prestador: string;
    auditData: SavedAuditData;
}

interface GroupedAudits {
    [month: string]: AuditFile[];
}

interface AuditSearchProps {
    onAuditLoad: (auditData: SavedAuditData, prestadorName: string, month: string) => void;
}

const GLOBAL_STORAGE_KEY = 'dusakawi_audits_v1';

export default function AuditSearch({ onAuditLoad }: AuditSearchProps) {
    const [audits, setAudits] = useState<GroupedAudits>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
    const [isContinuing, setIsContinuing] = useState(false);
    const { toast } = useToast();

    const fetchAudits = useCallback(async () => {
        setIsLoading(true);
        try {
            const auditsJson = localStorage.getItem(GLOBAL_STORAGE_KEY);
            const savedAudits = auditsJson ? JSON.parse(auditsJson) : {};
            
            // Recopilamos todas las auditorías registradas
            const auditList: AuditFile[] = Object.values(savedAudits).map((a: any) => ({
                id: a.id,
                month: a.month,
                prestador: a.prestadorName,
                auditData: a.auditData
            }));

            // Lógica de recuperación: Buscar llaves individuales antiguas que no estén en el registro global
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('audit-') && key !== GLOBAL_STORAGE_KEY) {
                    const nit = key.replace('audit-', '');
                    const isAlreadyInRegistry = auditList.some(a => a.id.includes(nit));
                    
                    if (!isAlreadyInRegistry) {
                        try {
                            const oldData = JSON.parse(localStorage.getItem(key)!);
                            // Si encontramos una "huérfana", la añadimos temporalmente para que el usuario pueda guardarla bien
                            auditList.push({
                                id: `recuperada_${nit}`,
                                month: 'Recuperada',
                                prestador: `NIT: ${nit}`,
                                auditData: oldData
                            });
                        } catch (e) {}
                    }
                }
            }
            
            const grouped = auditList.reduce((acc, audit) => {
                const { month } = audit;
                if (!acc[month]) acc[month] = [];
                acc[month].push(audit);
                return acc;
            }, {} as GroupedAudits);

            setAudits(grouped);
        } catch (error) {
            console.error("Error al cargar auditorías:", error);
            setAudits({});
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAudits();
    }, [fetchAudits]);

    const handleContinueAudit = async () => {
        if (!selectedAuditId) return;
        setIsContinuing(true);
        try {
            const auditsJson = localStorage.getItem(GLOBAL_STORAGE_KEY);
            const savedAudits = auditsJson ? JSON.parse(auditsJson) : {};
            let selected = savedAudits[selectedAuditId];

            // Si no está en el registro global, buscar en las recuperadas
            if (!selected) {
                const allRecovered = Object.values(audits).flat().find(a => a.id === selectedAuditId);
                if (allRecovered) selected = { auditData: allRecovered.auditData, prestadorName: allRecovered.prestador, month: allRecovered.month };
            }

            if (selected && selected.auditData) {
                onAuditLoad(selected.auditData, selected.prestadorName, selected.month);
                toast({ title: "Auditoría Cargada", description: `Continuando auditoría de ${selected.prestadorName}.` });
            } else {
                 throw new Error("No se pudo encontrar la auditoría.");
            }
        } catch (error) {
            toast({ title: "Error", description: "No se pudo cargar la auditoría.", variant: "destructive" });
        } finally {
            setIsContinuing(false);
        }
    };

    return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
             <Select onValueChange={setSelectedAuditId} disabled={isLoading || Object.keys(audits).length === 0}>
                <SelectTrigger className="w-full sm:w-[350px]">
                    <Search className="mr-2 h-4 w-4" />
                    <SelectValue placeholder={isLoading ? "Buscando auditorías..." : "Selecciona una auditoría guardada..."} />
                </SelectTrigger>
                <SelectContent>
                    {Object.keys(audits).length > 0 ? (
                         Object.entries(audits).map(([month, files]) => (
                            <SelectGroup key={month}>
                                <SelectLabel className="text-primary font-bold">{month}</SelectLabel>
                                {files.map((file) => (
                                    <SelectItem key={file.id} value={file.id}>{file.prestador}</SelectItem>
                                ))}
                            </SelectGroup>
                        ))
                    ) : (
                        <SelectItem value="none" disabled>{isLoading ? 'Cargando...' : 'No se encontraron auditorías.'}</SelectItem>
                    )}
                </SelectContent>
            </Select>
            <Button onClick={handleContinueAudit} disabled={!selectedAuditId || isContinuing}>
                {isContinuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Continuar Auditoría
            </Button>
            <Button variant="outline" size="icon" onClick={fetchAudits} title="Refrescar lista">
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
        </div>
    );
}
