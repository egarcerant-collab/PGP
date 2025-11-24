
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
import { Loader2, Search, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
            const response = await fetch('/api/list-audits');
            if (!response.ok) {
                // It's ok if it fails, maybe the dir doesn't exist yet
                setAudits({});
                return;
            }
            const data: AuditFile[] = await response.json();
            
            const grouped = data.reduce((acc, audit) => {
                const { month } = audit;
                if (!acc[month]) {
                    acc[month] = [];
                }
                acc[month].push(audit);
                return acc;
            }, {} as GroupedAudits);

            setAudits(grouped);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            toast({
                title: "Error al cargar auditorías",
                description: `No se pudo obtener la lista de auditorías: ${errorMessage}`,
                variant: "destructive",
            });
            setAudits({});
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchAudits();
    }, [fetchAudits]);

    const handleContinueAudit = async () => {
        if (!selectedAuditPath) {
             toast({
                title: "No se ha seleccionado una auditoría",
                description: "Por favor, elige una auditoría del menú desplegable.",
                variant: "destructive",
            });
            return;
        }
        setIsContinuing(true);
        try {
            // The path is already correct from the SelectItem value.
            const response = await fetch(selectedAuditPath);
            if (!response.ok) {
                throw new Error(`No se pudo cargar el archivo de auditoría desde ${selectedAuditPath}`);
            }
            const auditData: SavedAuditData = await response.json();

            // We need to extract the prestador and month from the path for the onAuditLoad function
            const pathParts = selectedAuditPath.split('/');
            const month = pathParts[pathParts.length - 2];
            const prestadorName = pathParts[pathParts.length - 1].replace('.json', '').replace(/_/g, ' ');

            if (auditData && prestadorName && month) {
                onAuditLoad(auditData, prestadorName, month);
                toast({
                    title: "Auditoría Cargada",
                    description: `Se ha cargado la auditoría para ${prestadorName} del mes de ${month}.`
                });
            } else {
                 throw new Error("El archivo de auditoría no tiene el formato esperado o faltan datos.");
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
                onValueChange={setSelectedAuditPath} 
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
                                    <SelectItem key={file.path} value={`/informes/${file.month}/${file.prestador}.json`}>
                                        {file.prestador.replace(/_/g, ' ')}
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

            <Button onClick={handleContinueAudit} disabled={!selectedAuditPath || isContinuing}>
                {isContinuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Continuar Auditoría
            </Button>
        </div>
    );
}
