"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { MonthlyExecutionData, SavedAuditData, RegimenTotals } from "@/components/app/JsonAnalyzerPage";
import { deserializeExecutionData } from "@/components/app/JsonAnalyzerPage";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Loader2, BarChart3, FileJson, LayoutDashboard, TrendingUp,
  Sliders, FileText, Archive, CheckCircle2, Lock, ChevronRight, Activity, Search, ShieldCheck, Save,
  Users, LogOut, ClipboardCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
export type ModuleId = "datos" | "inicio" | "financiero" | "cups" | "ajustes" | "informes" | "historial" | "validador" | "cierre";

interface NavItem {
  id: ModuleId;
  label: string;
  icon: React.ElementType;
  group: "general" | "analisis";
  requiresData?: boolean;
}

const NAV: NavItem[] = [
  { id: "datos",      label: "Carga de Datos",          icon: FileJson,        group: "general" },
  { id: "validador",  label: "Validador NT",             icon: ShieldCheck,     group: "general" },
  { id: "historial",  label: "Historial",                icon: Archive,         group: "general" },
  { id: "informes",   label: "Informes y Certificados",  icon: FileText,        group: "general" },
  { id: "inicio",     label: "Dashboard",                icon: LayoutDashboard, group: "analisis", requiresData: true },
  { id: "financiero", label: "Análisis Financiero",      icon: TrendingUp,      group: "analisis", requiresData: true },
  { id: "cups",       label: "CUPS / Tecnologías",       icon: Activity,        group: "analisis", requiresData: true },
  { id: "ajustes",    label: "Descuentos y Ajustes",     icon: Sliders,         group: "analisis", requiresData: true },
  { id: "cierre",     label: "Generación de Certificados", icon: ClipboardCheck, group: "analisis", requiresData: true },
];

export default function Home() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ nombre: string; rol: string; email: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const [activeModule, setActiveModule] = useState<ModuleId>("datos");
  const [executionData, setExecutionData] = useState<ExecutionDataByMonth>(new Map());
  const [jsonPrestadorCode, setJsonPrestadorCode] = useState<string | null>(null);
  const [uniqueUserCount, setUniqueUserCount] = useState<number>(0);
  const [savedAuditData, setSavedAuditData] = useState<SavedAuditData | null>(null);
  const [regimenTotals, setRegimenTotals] = useState<RegimenTotals>({
    subsidiado: 0, contributivo: 0, byMonth: {}, subsidiadoUsers: 0, contributivoUsers: 0,
  });
  const [selectedPrestadorName, setSelectedPrestadorName] = useState<string | null>(null);

  const pgpSearchRef = useRef<{ handleSelectPrestador: (p: { PRESTADOR: string; WEB: string }) => void; triggerSave: (password: string, months: string[]) => Promise<{ numero: string } | { error: string }> } | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savePw, setSavePw] = useState('');
  const [savePwError, setSavePwError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNumero, setSavedNumero] = useState<string | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.profile) {
          setCurrentUser({
            nombre: data.profile.nombre,
            rol: data.profile.rol,
            email: data.profile.email,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  };

  const hasData = executionData.size > 0;
  // También considera datos completos si se cargó una auditoría guardada con pgpData
  const hasFullData = (hasData || !!savedAuditData?.pgpData) && !!selectedPrestadorName;

  const handleAuditLoad = useCallback((auditPackage: SavedAuditData, prestadorName: string) => {
    setSavedAuditData(auditPackage);
    if (auditPackage.executionData && Object.keys(auditPackage.executionData).length > 0) {
      try {
        const deserialized = deserializeExecutionData(auditPackage.executionData);
        setExecutionData(deserialized);
      } catch (e) {
        console.warn('No se pudo deserializar executionData:', e);
      }
    }
    if (auditPackage.jsonPrestadorCode) setJsonPrestadorCode(auditPackage.jsonPrestadorCode);
    if (auditPackage.uniqueUserCount) setUniqueUserCount(auditPackage.uniqueUserCount);
    setSelectedPrestadorName(prestadorName);
    setActiveModule("inicio");
  }, []);

  const monthName = (key: string) => {
    const n = parseInt(key);
    if (isNaN(n)) return key;
    return new Date(2024, n - 1, 1).toLocaleString('es-CO', { month: 'long' }).toUpperCase();
  };

  const toggleMonth = (key: string) => {
    setSelectedMonths(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : prev.length < 3 ? [...prev, key] : prev
    );
  };

  const handleSaveAudit = async () => {
    if (savePw !== '123456') { setSavePwError(true); return; }
    if (selectedMonths.length === 0) return;
    setIsSaving(true);
    try {
      const result = await pgpSearchRef.current?.triggerSave(savePw, selectedMonths);
      if (!result) { setSavePwError(false); setShowSaveModal(false); return; }
      if ('error' in result) {
        setSavePwError(result.error === 'Contraseña incorrecta.');
      } else {
        setSavedNumero(result.numero);
        setShowSaveModal(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

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
                const locked = item.requiresData && !hasFullData && currentUser?.rol !== 'superadmin';
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

        {/* User footer — siempre visible */}
        <div className="px-3 pb-1 pt-2 border-t border-border shrink-0 space-y-1">
          {currentUser && (
            <>
              {currentUser.rol === 'superadmin' && (
                <button
                  onClick={() => router.push('/admin')}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span>Gestión de usuarios</span>
                </button>
              )}
              <div className="flex items-center gap-2 px-1 py-1">
                <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary uppercase shrink-0">
                  {currentUser.nombre.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate leading-tight">{currentUser.nombre}</p>
                  <span className={cn(
                    "inline-block text-[9px] font-semibold rounded px-1 py-0.5 leading-none mt-0.5",
                    currentUser.rol === 'superadmin' ? 'bg-red-100 text-red-700' :
                    currentUser.rol === 'auditor' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  )}>
                    {currentUser.rol === 'superadmin' ? 'Super Admin' : currentUser.rol === 'auditor' ? 'Auditor' : 'Viewer'}
                  </span>
                </div>
              </div>
            </>
          )}
          {/* Botón cerrar sesión — siempre visible */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <LogOut className="h-3.5 w-3.5 shrink-0" />}
            <span>Cerrar sesión</span>
          </button>
        </div>

        {/* Status footer */}
        <div className="p-3 border-t border-border shrink-0">
          {hasFullData ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Auditoría activa</span>
              </div>
              <p className="text-[10px] text-emerald-600 truncate leading-tight">{selectedPrestadorName}</p>
              <p className="text-[10px] text-emerald-500">{executionData.size} mes{executionData.size !== 1 ? "es" : ""} cargado{executionData.size !== 1 ? "s" : ""}</p>
              {savedNumero && <p className="text-[10px] text-emerald-700 font-bold">Guardada N° {savedNumero}</p>}
              <button
                onClick={() => { setShowSaveModal(true); setSavePw(''); setSavePwError(false); setSelectedMonths(Array.from(executionData.keys()).slice(0,3)); }}
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold py-1.5 rounded-md transition-colors"
              >
                <Save className="h-3 w-3" />
                Guardar Auditoría
              </button>
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
                userRole={currentUser?.rol}
                userName={currentUser?.nombre}
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
              userName={currentUser?.nombre}
              userRole={currentUser?.rol}
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

      {/* Modal contraseña guardar auditoría */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-88 space-y-4" style={{width: '360px'}}>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Save className="h-4 w-4 text-emerald-600" />
              Guardar Auditoría
            </h3>
            <p className="text-sm text-muted-foreground">
              <strong>{selectedPrestadorName}</strong> — selecciona hasta 3 meses.
            </p>

            {/* Selección de meses */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Meses a incluir</p>
              <div className="grid grid-cols-2 gap-2">
                {Array.from(executionData.keys()).map(key => {
                  const checked = selectedMonths.includes(key);
                  const disabled = !checked && selectedMonths.length >= 3;
                  return (
                    <label key={key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors ${checked ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold' : disabled ? 'opacity-40 cursor-not-allowed border-border' : 'border-border hover:bg-muted'}`}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleMonth(key)} className="accent-emerald-600" />
                      {monthName(key)}
                    </label>
                  );
                })}
              </div>
              {selectedMonths.length === 0 && <p className="text-xs text-amber-600">Selecciona al menos un mes.</p>}
              {selectedMonths.length === 3 && <p className="text-xs text-emerald-600">Máximo 3 meses seleccionados.</p>}
            </div>

            <Input
              type="password"
              placeholder="Contraseña"
              value={savePw}
              onChange={e => { setSavePw(e.target.value); setSavePwError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleSaveAudit()}
              className={savePwError ? 'border-red-500' : ''}
              autoFocus
            />
            {savePwError && <p className="text-xs text-red-500">Contraseña incorrecta.</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowSaveModal(false)}>Cancelar</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSaveAudit} disabled={isSaving || selectedMonths.length === 0}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar {selectedMonths.length > 0 && `(${selectedMonths.length} mes${selectedMonths.length > 1 ? 'es' : ''})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
