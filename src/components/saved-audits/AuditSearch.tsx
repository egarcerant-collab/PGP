
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
    path: string;
    auditData: SavedAuditData;
}

interface GroupedAudits {
    [month: string]: AuditFile[];
}

interface AuditSearchProps {
    onAuditLoad: (auditData: SavedAuditData, prestadorName: string, month: string) => void;
}

export default function AuditSearch({ onAuditLoad }: AuditSearchProps) {
    const [audits, setAudits] = useState<GroupedAudits>({});
    const [isLoading, setIsLoading] = useState(true);
    const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
    const [isContinuing, setIsContinuing] = useState(false);
    const { toast } = useToast();

    const fetchAudits = useCallback(async () => {
        setIsLoading(true);
        try {
            // PIBOT: Use LocalStorage shared registry instead of server API
            const GLOBAL_STORAGE_KEY = 'dusakawi_audits_v1';
            const auditsJson = localStorage.getItem(GLOBAL_STORAGE_KEY);
            const savedAudits = auditsJson ? JSON.parse(auditsJson) : {};
            
            const auditList: AuditFile[] = Object.values(savedAudits).map((a: any) => ({
                id: a.id,
                month: a.month,
                prestador: a.prestadorName,
                path: 'local',
                auditData: a.auditData
            }));
            
            const grouped = auditList.reduce((acc, audit) => {
                const { month } = audit;
                if (!acc[month]) {
                    acc[month] = [];
                }
                acc[month].push(audit);
                return acc;
            }, {} as GroupedAudits);

            setAudits(grouped);
        } catch (error) {
            console.error("Error al cargar auditorías locales:", error);
            setAudits({});
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAudits();
    }, [fetchAudits]);

    const handleContinueAudit = async () => {
        if (!selectedAuditId) {
             toast({
                title: "No se ha seleccionado una auditoría",
                description: "Por favor, elige una auditoría del menú desplegable.",
                variant: "destructive",
            });
            return;
        }
        setIsContinuing(true);
        try {
            const GLOBAL_STORAGE_KEY = 'dusakawi_audits_v1';
            const auditsJson = localStorage.getItem(GLOBAL_STORAGE_KEY);
            const savedAudits = auditsJson ? JSON.parse(auditsJson) : {};
            const selected = savedAudits[selectedAuditId];

            if (selected && selected.auditData) {
                onAuditLoad(selected.auditData, selected.prestadorName, selected.month);
                toast({
                    title: "Auditoría Cargada",
                    description: `Se ha cargado la auditoría para ${selected.prestadorName} del mes de ${selected.month}.`
                });
            } else {
                 throw new Error("No se pudo encontrar la auditoría seleccionada.");
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            toast({
                title: "Error al Cargar Auditoría",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsContinuing(false);
        }
    };


    return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
             <Select 
                onValueChange={setSelectedAuditId} 
                disabled={isLoading || Object.keys(audits).length === 0}
            >
                <SelectTrigger className="w-full sm:w-[350px]">
                    <Search className="mr-2 h-4 w-4" />
                    <SelectValue placeholder={isLoading ? "Buscando auditorías..." : "Selecciona una auditoría guardada..."} />
                </SelectTrigger>
                <SelectContent>
                    {Object.keys(audits).length > 0 ? (
                         Object.entries(audits).map(([month, files]) => (
                            <SelectGroup key={month}>
                                <SelectLabel>{month}</SelectLabel>
                                {files.map((file) => (
                                    <SelectItem key={file.id} value={file.id}>
                                        {file.prestador}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))
                    ) : (
                        <SelectItem value="none" disabled>
                            {isLoading ? 'Cargando...' : 'No se encontraron auditorías guardadas.'}
                        </SelectItem>
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
