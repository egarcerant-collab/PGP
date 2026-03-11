
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
import { Loader2, Search, Play, RefreshCw, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import type { SavedAuditData } from '../app/JsonAnalyzerPage';

interface AuditFile {
    month: string;
    prestador: string;
    path: string;
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
    const [selectedAuditPath, setSelectedAuditPath] = useState<string | null>(null);
    const [isContinuing, setIsContinuing] = useState(false);
    const { toast } = useToast();

    const fetchAudits = useCallback(async () => {
        setIsLoading(true);
        try {
            // Consultamos la API que lista los archivos físicos del servidor
            const response = await fetch('/api/list-audits');
            const data: AuditFile[] = await response.json();
            
            if (!Array.isArray(data)) throw new Error("Error en el formato de respuesta");

            const grouped = data.reduce((acc, audit) => {
                const { month } = audit;
                if (!acc[month]) acc[month] = [];
                acc[month].push(audit);
                return acc;
            }, {} as GroupedAudits);

            setAudits(grouped);
        } catch (error) {
            console.error("Error al cargar auditorías del servidor:", error);
            toast({ title: "Error de Servidor", description: "No se pudieron listar los archivos físicos.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchAudits();
    }, [fetchAudits]);

    const handleContinueAudit = async () => {
        if (!selectedAuditPath) return;
        setIsContinuing(true);
        try {
            // Buscamos el objeto de auditoría en el mapa para tener el nombre
            const allAudits = Object.values(audits).flat();
            const auditInfo = allAudits.find(a => a.path === selectedAuditPath);

            if (!auditInfo) throw new Error("Información de auditoría no encontrada.");

            // Cargamos el JSON directamente desde public/
            const response = await fetch(selectedAuditPath);
            if (!response.ok) throw new Error("No se pudo descargar el archivo JSON.");
            
            const auditData: SavedAuditData = await response.json();

            onAuditLoad(auditData, auditInfo.prestador, auditInfo.month);
            toast({ title: "Auditoría Restaurada", description: `Cargada desde ${selectedAuditPath}` });
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsContinuing(false);
        }
    };

    return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
             <Select onValueChange={setSelectedAuditPath} disabled={isLoading || Object.keys(audits).length === 0}>
                <SelectTrigger className="w-full sm:w-[400px]">
                    <FolderOpen className="mr-2 h-4 w-4 text-primary" />
                    <SelectValue placeholder={isLoading ? "Buscando archivos..." : "Escoger auditoría del servidor..."} />
                </SelectTrigger>
                <SelectContent>
                    {Object.keys(audits).length > 0 ? (
                         Object.entries(audits).map(([month, files]) => (
                            <SelectGroup key={month}>
                                <SelectLabel className="text-primary font-bold uppercase">{month}</SelectLabel>
                                {files.map((file) => (
                                    <SelectItem key={file.path} value={file.path}>
                                        {file.prestador.toUpperCase()}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))
                    ) : (
                        <SelectItem value="none" disabled>No se encontraron archivos .json</SelectItem>
                    )}
                </SelectContent>
            </Select>
            <Button onClick={handleContinueAudit} disabled={!selectedAuditPath || isContinuing} className="bg-primary hover:bg-primary/90">
                {isContinuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Cargar Auditoría
            </Button>
            <Button variant="outline" size="icon" onClick={fetchAudits} title="Refrescar carpetas">
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
        </div>
    );
}
