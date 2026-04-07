"use client";

import { useState, useRef, useCallback } from "react";
import type { MonthlyExecutionData, SavedAuditData, RegimenTotals } from "@/components/app/JsonAnalyzerPage";
import { deserializeExecutionData } from "@/components/app/JsonAnalyzerPage";
import dynamic from "next/dynamic";
import {
  Loader2, BarChart3, FileJson, LayoutDashboard, TrendingUp,
  Sliders, FileText, Archive, CheckCircle2, Lock, ChevronRight, Activity, Search
} from "lucide-react";
import SavedAuditsPage from "@/components/app/SavedAuditsPage";
import { cn } from "@/lib/utils";

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
export type ModuleId = "datos" | "inicio" | "financiero" | "cups" | "ajustes" | "informes" | "historial";

interface NavItem {
  id: ModuleId;
  label: string;
  icon: React.ElementType;
  group: "general" | "analisis";
  requiresData?: boolean;
}

const NAV: NavItem[] = [
  { id: "datos",      label: "Carga de Datos",          icon: FileJson,        group: "general" },
  { id: "historial",  label: "Historial",                icon: Archive,         group: "general" },
  { id: "inicio",     label: "Dashboard",                icon: LayoutDashboard, group: "analisis", requiresData: true },
  { id: "financiero", label: "Análisis Financiero",      icon: TrendingUp,      group: "analisis", requiresData: true },
  { id: "cups",       label: "CUPS / Tecnologías",       icon: Activity,        group: "analisis", requiresData: true },
  { id: "ajustes",    label: "Descuentos y Ajustes",     icon: Sliders,         group: "analisis", requiresData: true },
  { id: "informes",   label: "Informes y Certificados",  icon: FileText,        group: "analisis", requiresData: true },
];

export default function Home() {
  const [activeModule, setActiveModule] = useState<ModuleId>("datos");
  const [executionData, setExecutionData] = useState<ExecutionDataByMonth>(new Map());
  const [jsonPrestadorCode, setJsonPrestadorCode] = useState<string | null>(null);
  const [uniqueUserCount, setUniqueUserCount] = useState<number>(0);
  const [savedAuditData, setSavedAuditData] = useState<SavedAuditData | null>(null);
  const [regimenTotals, setRegimenTotals] = useState<RegimenTotals>({
    subsidiado: 0, contributivo: 0, byMonth: {}, subsidiadoUsers: 0, contributivoUsers: 0,
  });
  const [selectedPrestadorName, setSelectedPrestadorName] = useState<string | null>(null);

  const pgpSearchRef = useRef<{ handleSelectPrestador: (p: { PRESTADOR: string; WEB: string }) => void } | null>(null);

  const hasData = executionData.size > 0;
  const hasFullData = hasData && !!selectedPrestadorName;

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
    setSelectedPrestadorName(prestadorName);
    setActiveModule("inicio");
  }, []);

  const handlePrestadorLoaded = useCallback((name: string) => {
    setSelectedPrestadorName(name);
    setActiveModule("inicio");
  }, []);

  const current = NAV.find(n => n.id === activeModule);

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── SIDEBAR ── */}
      <aside className="w-[220px] shrink-0 flex flex-col border-r border-border bg-card">

        {/* Logo */}
        <div className="h-14 px-4 flex items-center gap-3 border-b border-border shrink-0">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <BarChart3 className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="leading-tight min-w-0">
            <p className="font-bold text-sm text-foreground">Auditoría PGP</p>
            <p className="text-[10px] text-muted-foreground truncate">Dusakawi EPSI · DNR</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2.5 overflow-y-auto space-y-4">
          <div>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">General</p>
            <div className="space-y-0.5">
              {NAV.filter(n => n.group === "general").map(item => (
                <button key={item.id} onClick={() => setActiveModule(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    activeModule === item.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Análisis</p>
            <div className="space-y-0.5">
              {NAV.filter(n => n.group === "analisis").map(item => {
                const locked = item.requiresData && !hasFullData;
                return (
                  <button key={item.id}
                    onClick={() => !locked && setActiveModule(item.id)}
                    disabled={locked}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      activeModule === item.id && !locked
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : locked
                          ? "opacity-30 cursor-not-allowed text-muted-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {locked && <Lock className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Status footer */}
        <div className="p-3 border-t border-border shrink-0">
          {hasFullData ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Auditoría activa</span>
              </div>
              <p className="text-[10px] text-emerald-600 mt-0.5 truncate leading-tight">{selectedPrestadorName}</p>
              <p className="text-[10px] text-emerald-500">{executionData.size} mes{executionData.size !== 1 ? "es" : ""} cargado{executionData.size !== 1 ? "s" : ""}</p>
            </div>
          ) : hasData ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-amber-700">
                <Search className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Falta prestador</span>
              </div>
              <p className="text-[10px] text-amber-600 mt-0.5">{executionData.size} mes{executionData.size !== 1 ? "es" : ""} en memoria</p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground font-medium">Sin datos activos</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Carga un JSON para comenzar</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-border bg-card/95 backdrop-blur-sm flex items-center px-6 gap-3">
          <h1 className="font-semibold text-sm text-foreground">{current?.label || "Auditoría PGP"}</h1>
          {selectedPrestadorName && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{selectedPrestadorName}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {hasData && (
              <span className="text-xs text-muted-foreground bg-muted rounded-md px-2 py-1">
                {executionData.size} mes{executionData.size !== 1 ? "es" : ""} cargado{executionData.size !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">

          {/* ── datos module ── */}
          <div className={cn("p-6", activeModule !== "datos" && "hidden")}>
            <div className="max-w-5xl mx-auto space-y-6">
              <JsonAnalyzerPage
                setExecutionData={setExecutionData}
                setJsonPrestadorCode={setJsonPrestadorCode}
                setUniqueUserCount={setUniqueUserCount}
                setRegimenTotals={setRegimenTotals}
              />
            </div>
          </div>

          {/* ── analysis modules — PgPsearchForm always mounted ── */}
          <div className={cn("p-6", (activeModule === "historial") && "hidden")}>
            <PgPsearchForm
              ref={pgpSearchRef}
              executionDataByMonth={executionData}
              jsonPrestadorCode={jsonPrestadorCode}
              uniqueUserCount={uniqueUserCount}
              initialAuditData={savedAuditData}
              regimenTotals={regimenTotals}
              activeModule={activeModule}
              onPrestadorLoaded={handlePrestadorLoaded}
            />
          </div>

          {/* ── historial module ── */}
          <div className={cn("p-6", activeModule !== "historial" && "hidden")}>
            <div className="max-w-5xl mx-auto">
              <SavedAuditsPage onAuditLoad={handleAuditLoad} />
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
