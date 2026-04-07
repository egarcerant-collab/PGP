"use client";

import { useState, useRef, useCallback } from "react";
import type { MonthlyExecutionData, SavedAuditData, RegimenTotals } from "@/components/app/JsonAnalyzerPage";
import { deserializeExecutionData } from "@/components/app/JsonAnalyzerPage";
import dynamic from "next/dynamic";
import { Loader2, BarChart3, FileJson, Search, ChevronRight } from "lucide-react";
import SavedAuditsPage from "@/components/app/SavedAuditsPage";
import { Separator } from "@/components/ui/separator";

const JsonAnalyzerPage = dynamic(() => import("@/components/app/JsonAnalyzerPage"), {
  loading: () => <div className="flex items-center justify-center p-8"><Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />Cargando...</div>,
  ssr: false,
});

const PgPsearchForm = dynamic(() => import("@/components/pgp-search/PgPsearchForm"), {
  loading: () => <div className="flex items-center justify-center p-8"><Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />Cargando...</div>,
  ssr: false,
});

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
  const [regimenTotals, setRegimenTotals] = useState<RegimenTotals>({
    subsidiado: 0, contributivo: 0, byMonth: {}, subsidiadoUsers: 0, contributivoUsers: 0,
  });

  const pgpSearchRef = useRef<{ handleSelectPrestador: (p: { PRESTADOR: string; WEB: string }) => void } | null>(null);

  const handleAuditLoad = useCallback((auditPackage: SavedAuditData, prestadorName: string) => {
    setSavedAuditData(auditPackage);
    if (auditPackage.executionData) {
      setExecutionData(deserializeExecutionData(auditPackage.executionData));
      if (auditPackage.jsonPrestadorCode) setJsonPrestadorCode(auditPackage.jsonPrestadorCode);
      if (auditPackage.uniqueUserCount) setUniqueUserCount(auditPackage.uniqueUserCount);
    }
    if (!auditPackage.pgpData && pgpSearchRef.current?.handleSelectPrestador) {
      pgpSearchRef.current.handleSelectPrestador({ PRESTADOR: prestadorName, WEB: "" });
    }
  }, []);

  const hasData = executionData.size > 0;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-sm text-foreground tracking-tight">Auditoría PGP</span>
              <span className="text-xs text-muted-foreground hidden sm:block">Dusakawi EPSI — Dirección Nacional del Riesgo</span>
            </div>
          </div>

          {/* Steps indicator */}
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${hasData ? 'text-primary font-semibold' : ''}`}>
              <FileJson className="h-3.5 w-3.5" />
              <span>1. Cargar JSON</span>
            </div>
            <ChevronRight className="h-3 w-3 opacity-40" />
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md`}>
              <Search className="h-3.5 w-3.5" />
              <span>2. Seleccionar Prestador</span>
            </div>
            <ChevronRight className="h-3 w-3 opacity-40" />
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>3. Resultados</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">

        {/* Upload + PGP in one continuous flow */}
        <div className="space-y-4">
          {/* Step 1 label */}
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <h2 className="text-sm font-semibold text-foreground">Análisis de Datos Reales (JSON)</h2>
          </div>
          <JsonAnalyzerPage
            setExecutionData={setExecutionData}
            setJsonPrestadorCode={setJsonPrestadorCode}
            setUniqueUserCount={setUniqueUserCount}
            setRegimenTotals={setRegimenTotals}
          />
        </div>

        <div className="space-y-4">
          {/* Step 2 label */}
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <h2 className="text-sm font-semibold text-foreground">Análisis de Nota Técnica (PGP)</h2>
          </div>
          <PgPsearchForm
            ref={pgpSearchRef}
            executionDataByMonth={executionData}
            jsonPrestadorCode={jsonPrestadorCode}
            uniqueUserCount={uniqueUserCount}
            initialAuditData={savedAuditData}
            regimenTotals={regimenTotals}
          />
        </div>

        <Separator className="my-8" />

        <SavedAuditsPage onAuditLoad={handleAuditLoad} />
      </main>
    </div>
  );
}
