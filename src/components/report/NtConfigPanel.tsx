"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Settings2 } from "lucide-react";
import type { NtConfigEntry } from "@/lib/nt-config";
import { MONTH_NAMES } from "@/lib/nt-config";

const fmtCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(v);

const parseCOP = (s: string): number => {
  const clean = s.replace(/[$\s.]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};

interface NtConfigPanelProps {
  /** NIT pre-cargado desde el prestador activo */
  defaultNit?: string;
  defaultPrestador?: string;
  defaultContrato?: string;
}

export default function NtConfigPanel({ defaultNit = "", defaultPrestador = "", defaultContrato = "" }: NtConfigPanelProps) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<NtConfigEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Formulario nuevo
  const [form, setForm] = useState({
    nit: defaultNit,
    prestador: defaultPrestador,
    contrato: defaultContrato,
    mesInicio: "ENERO",
    mesFin: "DICIEMBRE",
    nt: "",
    vigencia: String(new Date().getFullYear()),
    nota: "",
  });

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/nt-config");
      const d = await r.json();
      setConfigs(d.configs || []);
    } catch {
      toast({ title: "Error al cargar configuraciones NT", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (open) loadConfigs(); }, [open, loadConfigs]);

  // Pre-cargar NIT/prestador si cambia el prestador activo
  useEffect(() => {
    setForm(f => ({
      ...f,
      nit: defaultNit || f.nit,
      prestador: defaultPrestador || f.prestador,
      contrato: defaultContrato || f.contrato,
    }));
  }, [defaultNit, defaultPrestador, defaultContrato]);

  const handleSave = async () => {
    const nt = parseCOP(form.nt);
    if (!form.mesInicio || !form.mesFin || nt <= 0) {
      toast({ title: "Completa meses y valor NT", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/nt-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, nt, vigencia: Number(form.vigencia) }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      toast({ title: "✓ Configuración NT guardada" });
      setForm(f => ({ ...f, nt: "", nota: "", mesInicio: "ENERO", mesFin: "DICIEMBRE" }));
      loadConfigs();
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const r = await fetch(`/api/nt-config?id=${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      toast({ title: "✓ Configuración eliminada" });
      setConfigs(c => c.filter(x => x.id !== id));
    } catch (e: any) {
      toast({ title: "Error al eliminar", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  // Filtrar por NIT activo si hay uno
  const displayConfigs = form.nit
    ? configs.filter(c => c.nit.replace(/\D/g, "") === form.nit.replace(/\D/g, ""))
    : configs;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-1.5 transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Configurar NT por Período
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-bold text-indigo-800">Configuración de NT por Período</span>
          <span className="text-xs text-indigo-500 font-normal">(cuando hay reestructuración mid-year)</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">✕ Cerrar</button>
      </div>

      {/* Formulario nuevo rango */}
      <div className="bg-white rounded-lg border border-indigo-100 p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-600">Agregar rango de NT:</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">NIT</Label>
            <Input value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} placeholder="Ej: 900986941" className="text-xs h-7" />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <Label className="text-xs">Prestador</Label>
            <Input value={form.prestador} onChange={e => setForm(f => ({ ...f, prestador: e.target.value }))} placeholder="Nombre IPS" className="text-xs h-7" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vigencia</Label>
            <Input value={form.vigencia} onChange={e => setForm(f => ({ ...f, vigencia: e.target.value }))} placeholder="2026" className="text-xs h-7" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Mes inicio</Label>
            <Select value={form.mesInicio} onValueChange={v => setForm(f => ({ ...f, mesInicio: v }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTH_NAMES.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mes fin</Label>
            <Select value={form.mesFin} onValueChange={v => setForm(f => ({ ...f, mesFin: v }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTH_NAMES.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">NT Mensual ($)</Label>
            <Input value={form.nt} onChange={e => setForm(f => ({ ...f, nt: e.target.value }))} placeholder="136.312.035" className="text-xs h-7" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nota</Label>
            <Input value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} placeholder="Reestructuración abril" className="text-xs h-7" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
          Guardar rango
        </Button>
      </div>

      {/* Tabla de configuraciones */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando...
        </div>
      ) : displayConfigs.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-1">Sin configuraciones para este prestador.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-indigo-100 text-indigo-800">
                <th className="px-2 py-1 text-left font-semibold">Prestador</th>
                <th className="px-2 py-1 text-center font-semibold">Vigencia</th>
                <th className="px-2 py-1 text-center font-semibold">Mes Inicio</th>
                <th className="px-2 py-1 text-center font-semibold">Mes Fin</th>
                <th className="px-2 py-1 text-right font-semibold">NT Mensual</th>
                <th className="px-2 py-1 text-left font-semibold">Nota</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {displayConfigs.map(c => (
                <tr key={c.id} className="border-b border-indigo-100 hover:bg-indigo-50/50">
                  <td className="px-2 py-1 font-medium">{c.prestador || c.nit}</td>
                  <td className="px-2 py-1 text-center">{c.vigencia}</td>
                  <td className="px-2 py-1 text-center text-green-700 font-semibold">{c.mesInicio}</td>
                  <td className="px-2 py-1 text-center text-blue-700 font-semibold">{c.mesFin}</td>
                  <td className="px-2 py-1 text-right font-mono font-semibold text-indigo-700">{fmtCOP(c.nt)}</td>
                  <td className="px-2 py-1 text-slate-500 italic">{c.nota || "—"}</td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deleting === c.id}
                      className="text-red-400 hover:text-red-600 disabled:opacity-50"
                      title="Eliminar"
                    >
                      {deleting === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
