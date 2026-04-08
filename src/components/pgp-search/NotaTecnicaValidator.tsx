"use client";

import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import {
  Upload, FileSpreadsheet, Plus, RefreshCw, Check,
  AlertTriangle, ShieldCheck, Download, Lock, Loader2, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { findColumnValue } from '@/lib/matriz-helpers';
import { formatCurrency } from './PgPsearchForm';

interface PgpRow { [key: string]: any; }

interface NtRowDisplay {
  cup: string; descripcion: string;
  frecuencia: number; valorUnitario: number; costoMes: number;
}

function extractDisplayRow(row: PgpRow): NtRowDisplay {
  const cup = String(findColumnValue(row, ['cups', 'cup/cum', 'id resolucion 3100', 'código', 'cup', 'codigo']) ?? '').trim().toUpperCase();
  const descripcion = String(findColumnValue(row, ['descripcion', 'descripcion cups', 'descripcion id resolucion', 'nombre', 'servicio']) ?? 'Sin descripción').trim();
  const frecuencia = Number(findColumnValue(row, ['frecuencia eventos mes', 'frecuencia', 'frecuencia_mes']) ?? 0);
  const valorUnitario = Number(findColumnValue(row, ['valor', 'valor unitario', 'vr unitario', 'valor_unitario', 'costo']) ?? 0);
  const costoMes = Number(findColumnValue(row, ['costo evento mes (valor mes)', 'costo evento mes', 'valor total', 'valor_total']) ?? (frecuencia * valorUnitario));
  return { cup, descripcion, frecuencia, valorUnitario, costoMes };
}

function extractExportRow(row: PgpRow) {
  return {
    cups: String(findColumnValue(row, ['cups', 'cup/cum', 'id resolucion 3100', 'código', 'cup', 'codigo']) ?? '').trim().toUpperCase(),
    descripcion: String(findColumnValue(row, ['descripcion', 'descripcion cups', 'nombre', 'servicio']) ?? '').trim(),
    frecuencia: Number(findColumnValue(row, ['frecuencia eventos mes', 'frecuencia', 'frecuencia_mes']) ?? 0),
    valorUnitario: Number(findColumnValue(row, ['valor', 'valor unitario', 'vr unitario', 'valor_unitario', 'costo']) ?? 0),
    costoMes: Number(findColumnValue(row, ['costo evento mes (valor mes)', 'costo evento mes', 'valor total', 'valor_total']) ?? 0),
  };
}

interface NotaTecnicaValidatorProps {
  pgpData: PgpRow[];
  onUpdateNt: (rows: PgpRow[]) => void;
  prestadorName?: string;
  prestadorId?: string;
}

export default function NotaTecnicaValidator({ pgpData, onUpdateNt, prestadorName, prestadorId }: NotaTecnicaValidatorProps) {
  const { toast } = useToast();
  const [uploadedRows, setUploadedRows] = useState<PgpRow[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'merge' | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentRows = pgpData.map(extractDisplayRow).filter(r => r.cup);
  const totalCostoActual = currentRows.reduce((s, r) => s + r.costoMes, 0);

  const parseFile = useCallback((file: File) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim().replace(/\uFEFF/g, ''),
      complete: (results) => {
        const rows = results.data as PgpRow[];
        if (!rows.length) { toast({ title: "Archivo vacío", variant: "destructive" }); return; }
        setUploadedRows(rows);
        toast({ title: "Archivo cargado", description: `${rows.length} filas detectadas.` });
      },
      error: (err: Error) => toast({ title: "Error de lectura", description: err.message, variant: "destructive" }),
    });
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }, [parseFile]);

  const handleDownloadTemplate = useCallback(() => {
    const rows = [
      { 'cups': '890301', 'descripcion': 'CONSULTA DE PRIMERA VEZ POR MEDICINA GENERAL', 'frecuencia eventos mes': 120, 'valor unitario': 32500, 'costo evento mes (valor mes)': 3900000 },
      { 'cups': '890302', 'descripcion': 'CONSULTA DE CONTROL O DE SEGUIMIENTO POR MEDICINA GENERAL', 'frecuencia eventos mes': 200, 'valor unitario': 28000, 'costo evento mes (valor mes)': 5600000 },
      { 'cups': '903801', 'descripcion': 'TERAPIA INDIVIDUAL', 'frecuencia eventos mes': 50, 'valor unitario': 45000, 'costo evento mes (valor mes)': 2250000 },
    ];
    const csv = Papa.unparse(rows, { delimiter: ";" });
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla_nota_tecnica.xls";
    link.click();
  }, []);

  const handleExportCurrentNt = useCallback(() => {
    if (!pgpData.length) return;
    const exportRows = pgpData.map(row => ({
      'cups': extractExportRow(row).cups,
      'descripcion': extractExportRow(row).descripcion,
      'frecuencia eventos mes': extractExportRow(row).frecuencia,
      'valor unitario': extractExportRow(row).valorUnitario,
      'costo evento mes (valor mes)': extractExportRow(row).costoMes,
    })).filter(r => r.cups);
    const csv = Papa.unparse(exportRows, { delimiter: ";" });
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `NT_actualizada_${prestadorName || 'prestador'}.xls`;
    link.click();
    toast({ title: "NT exportada", description: `${exportRows.length} CUPS exportadas.` });
  }, [pgpData, prestadorName, toast]);

  const uploadedDisplayRows = uploadedRows?.map(extractDisplayRow).filter(r => r.cup) ?? [];
  const currentCupsSet = new Set(currentRows.map(r => r.cup));
  const newCups = uploadedDisplayRows.filter(r => !currentCupsSet.has(r.cup));
  const ignoredCups = uploadedDisplayRows.filter(r => currentCupsSet.has(r.cup));

  const handleConfirm = useCallback(async () => {
    if (password !== '123456') { setPasswordError(true); return; }
    if (!uploadedRows || !newCups.length) return;

    setSaving(true);
    try {
      const trulyNewRows = uploadedRows.filter(row => {
        const cup = String(findColumnValue(row, ['cups', 'cup/cum', 'id resolucion 3100', 'código', 'cup', 'codigo']) ?? '').trim().toUpperCase();
        return cup && !currentCupsSet.has(cup);
      });

      // Guardar en el servidor (persistente entre sesiones)
      if (prestadorId) {
        const exportRows = trulyNewRows.map(extractExportRow).filter(r => r.cups);
        const res = await fetch('/api/cups-adicionales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prestadorId, rows: exportRows }),
        });
        const result = await res.json();
        if (res.ok && result.success) {
          toast({ title: `✓ ${result.added} CUPS guardadas`, description: `Se cargarán automáticamente cada vez que selecciones ${prestadorName || 'este prestador'}.` });
        } else {
          toast({ title: "Aviso", description: result.message || "No se pudo guardar en el servidor.", variant: "destructive" });
        }
      }

      // Actualizar estado local inmediatamente
      onUpdateNt([...pgpData, ...trulyNewRows]);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
      setUploadedRows(null);
      setConfirmMode(null);
      setPassword('');
      setPasswordError(false);
    }
  }, [password, uploadedRows, newCups, currentCupsSet, pgpData, prestadorId, prestadorName, onUpdateNt, toast]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-sm text-foreground">Validador de Nota Técnica</h2>
              {currentRows.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportCurrentNt}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Exportar NT (.xls)
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {prestadorName
                ? <><strong>{prestadorName}</strong> · {currentRows.length} CUPS · Costo mes: {formatCurrency(totalCostoActual)}</>
                : "Sin NT activa. Selecciona un prestador en Carga de Datos."}
            </p>
          </div>
        </div>
      </div>

      {/* Upload zone */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Agregar CUPS a la NT</h3>
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4 mr-1.5" />
            Descargar plantilla
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Completa la plantilla con los CUPS nuevos y súbela aquí. Se guardarán automáticamente y se cargarán cada vez que selecciones este prestador.
        </p>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
          }`}
          onClick={() => document.getElementById('nt-file-input')?.click()}
        >
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Arrastra el archivo aquí o haz clic para seleccionar</p>
          <p className="text-xs text-muted-foreground mt-1">CSV o XLS con columnas: cups, descripcion, frecuencia, valor unitario, costo mes</p>
          <input id="nt-file-input" type="file" accept=".csv,.xls,.xlsx,.txt" className="hidden" onChange={handleFileInput} />
        </div>

        {/* Preview */}
        {uploadedRows && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                <Plus className="h-3 w-3 mr-1" />{newCups.length} CUPS nuevas
              </Badge>
              {ignoredCups.length > 0 && (
                <Badge variant="outline" className="text-muted-foreground border-border bg-muted">
                  <RefreshCw className="h-3 w-3 mr-1" />{ignoredCups.length} ya en NT (se ignoran)
                </Badge>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setUploadedRows(null)}>Cancelar</Button>
                <Button size="sm" onClick={() => { setPassword(''); setPasswordError(false); setConfirmMode('merge'); }} disabled={!newCups.length}>
                  <Check className="h-4 w-4 mr-1.5" />
                  Guardar {newCups.length} CUPS nuevas
                </Button>
              </div>
            </div>

            {newCups.length > 0 && (
              <div className="rounded-lg border border-green-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-green-50">
                      <TableHead className="text-xs">CUPS</TableHead>
                      <TableHead className="text-xs">Descripción</TableHead>
                      <TableHead className="text-xs text-right">Frec.</TableHead>
                      <TableHead className="text-xs text-right">Vr. Unitario</TableHead>
                      <TableHead className="text-xs text-right">Costo Mes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newCups.slice(0, 20).map((row, i) => (
                      <TableRow key={i} className="bg-green-50/30">
                        <TableCell className="text-xs font-mono">{row.cup}</TableCell>
                        <TableCell className="text-xs">{row.descripcion}</TableCell>
                        <TableCell className="text-xs text-right">{row.frecuencia}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(row.valorUnitario)}</TableCell>
                        <TableCell className="text-xs text-right">{formatCurrency(row.costoMes)}</TableCell>
                      </TableRow>
                    ))}
                    {newCups.length > 20 && (
                      <TableRow><TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-2">... y {newCups.length - 20} CUPS más</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* NT table */}
      {currentRows.length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              NT activa — {currentRows.length} CUPS
            </h3>
            <span className="text-xs text-muted-foreground">Total mes: {formatCurrency(totalCostoActual)}</span>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-y-auto max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs bg-muted sticky top-0">CUPS</TableHead>
                    <TableHead className="text-xs bg-muted sticky top-0">Descripción</TableHead>
                    <TableHead className="text-xs text-right bg-muted sticky top-0">Frec.</TableHead>
                    <TableHead className="text-xs text-right bg-muted sticky top-0">Vr. Unitario</TableHead>
                    <TableHead className="text-xs text-right bg-muted sticky top-0">Costo Mes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentRows.map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-mono">{row.cup}</TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate" title={row.descripcion}>{row.descripcion}</TableCell>
                      <TableCell className="text-xs text-right">{row.frecuencia}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(row.valorUnitario)}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(row.costoMes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : !uploadedRows && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No hay NT cargada.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Selecciona un prestador en <strong>Carga de Datos</strong>.</p>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={!!confirmMode} onOpenChange={(open) => { if (!open) { setConfirmMode(null); setPassword(''); setPasswordError(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              ¿Está seguro de agregar estos CUPS a la NT?
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground font-medium pt-1">
              Esto tendrá implicaciones técnicas y financieras.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p>· Se agregarán <strong>{newCups.length} CUPS nuevas</strong> a la NT de <strong>{prestadorName}</strong>.</p>
              <p>· Quedarán guardadas y se cargarán automáticamente en la próxima sesión.</p>
              <p>· Los valores de ejecución se recalcularán automáticamente.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Contraseña de confirmación
              </Label>
              <Input
                type="password" placeholder="••••••" value={password} autoFocus
                onChange={e => { setPassword(e.target.value); setPasswordError(false); }}
                onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
                className={passwordError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {passwordError && <p className="text-xs text-destructive">Contraseña incorrecta.</p>}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={saving} onClick={() => { setConfirmMode(null); setPassword(''); setPasswordError(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white">
              {saving
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Guardando…</>
                : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Confirmar y guardar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
