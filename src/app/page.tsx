"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MonthlyExecutionData, SavedAuditData } from "@/components/app/JsonAnalyzerPage";
import { deserializeExecutionData } from "@/components/app/JsonAnalyzerPage";
import dynamic from "next/dynamic";
import { Loader2, Key, ShieldCheck } from "lucide-react";
import SavedAuditsPage from "@/components/app/SavedAuditsPage";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const JsonAnalyzerPage = dynamic(
  () => import("@/components/app/JsonAnalyzerPage"),
  { 
    loading: () => <div className="flex items-center justify-center p-4"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Cargando Analizador JSON...</div>,
    ssr: false 
  }
);

const PgPsearchForm = dynamic(
  () => import("@/components/pgp-search/PgPsearchForm"),
  { 
    loading: () => <div className="flex items-center justify-center p-4"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Cargando Buscador PGP...</div>,
    ssr: false 
  }
);

export type CupCountInfo = {
  total: number;
  diagnoses: Map<string, number>; 
  totalValue: number;
  uniqueUsers: Set<string>;
  type: "Consulta" | "Procedimiento" | "Medicamento" | "Otro Servicio";
  jsonDescription?: string;
};

export type CupCountsMap = Map<string, CupCountInfo>;
export type ExecutionDataByMonth = Map<string, MonthlyExecutionData>;

export default function Home() {
  const [executionData, setExecutionData] = useState<ExecutionDataByMonth>(new Map());
  const [jsonPrestadorCode, setJsonPrestadorCode] = useState<string | null>(null);
  const [uniqueUserCount, setUniqueUserCount] = useState<number>(0);
  const [savedAuditData, setSavedAuditData] = useState<SavedAuditData | null>(null);
  const [apiKey, setApiKey] = useState<string>("");

  useEffect(() => {
    // Cargar la clave API desde el almacenamiento local al iniciar
    const savedKey = localStorage.getItem("PGP_ANALYZER_API_KEY");
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem("PGP_ANALYZER_API_KEY", newKey);
  };

  const pgpSearchRef = useRef<{ handleSelectPrestador: (prestador: { PRESTADOR: string; WEB: string }) => void } | null>(null);

  const handleAuditLoad = useCallback((auditPackage: SavedAuditData, prestadorName: string, month: string) => {
    setSavedAuditData(auditPackage);
    
    if (auditPackage.executionData) {
      const restoredData = deserializeExecutionData(auditPackage.executionData);
      setExecutionData(restoredData);
      if (auditPackage.jsonPrestadorCode) setJsonPrestadorCode(auditPackage.jsonPrestadorCode);
      if (auditPackage.uniqueUserCount) setUniqueUserCount(auditPackage.uniqueUserCount);
    }

    if (!auditPackage.pgpData && pgpSearchRef.current?.handleSelectPrestador) {
      pgpSearchRef.current.handleSelectPrestador({ PRESTADOR: prestadorName, WEB: '' }); 
    }
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12 bg-background">
      <div className="w-full max-w-7xl mx-auto space-y-8">
        <header className="text-center space-y-4">
          <h1 className="text-4xl font-headline font-bold tracking-tight text-foreground sm:text-5xl">
            Herramientas de Análisis PGP
          </h1>
          <p className="text-lg text-muted-foreground">
            Gestión integral de auditoría: Compare datos reales JSON con proyecciones de Notas Técnicas.
          </p>
        </header>

        <Card className="border-primary/20 shadow-sm bg-primary/5">
          <CardHeader className="py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Configuración de Seguridad IA
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 w-full space-y-1">
                <Label htmlFor="api-key-input" className="text-xs font-semibold">Google AI API Key</Label>
                <div className="relative">
                  <Input 
                    id="api-key-input"
                    type="password" 
                    placeholder="Pega aquí tu clave AIzaSy..." 
                    value={apiKey} 
                    onChange={handleApiKeyChange}
                    className="pr-10"
                  />
                  {apiKey.length > 10 && <ShieldCheck className="absolute right-3 top-2.5 h-5 w-5 text-green-500" />}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground max-w-[200px] text-center sm:text-left">
                Tu clave se guarda localmente en este navegador para habilitar la redacción senior de informes.
              </p>
            </div>
          </CardContent>
        </Card>

        <h2 className="text-3xl font-semibold text-center text-foreground pt-8">
          Nueva Auditoría
        </h2>

        <div className="grid grid-cols-1 gap-8 items-start">
          <div className="space-y-6">
             <h2 className="text-2xl font-semibold text-center">Paso 1: Análisis de Datos Reales (JSON)</h2>
             <JsonAnalyzerPage 
                setExecutionData={setExecutionData} 
                setJsonPrestadorCode={setJsonPrestadorCode}
                setUniqueUserCount={setUniqueUserCount}
              />
          </div>

          <div className="space-y-6">
             <h2 className="text-2xl font-semibold text-center">Paso 2: Análisis de Nota Técnica (PGP)</h2>
             <PgPsearchForm 
                ref={pgpSearchRef}
                executionDataByMonth={executionData}
                jsonPrestadorCode={jsonPrestadorCode}
                uniqueUserCount={uniqueUserCount}
                initialAuditData={savedAuditData}
                apiKey={apiKey}
              />
          </div>
        </div>

        <Separator className="my-12" />

        <SavedAuditsPage onAuditLoad={handleAuditLoad} />
      </div>
    </main>
  );
}
