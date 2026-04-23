'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileSpreadsheet, KeyRound, Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ProviderRow = {
  nit: string;
  prestador: string;
  id_zona: string;
  web: string;
  poblacion: string;
  contrato: string;
  ciudad: string;
  departamento: string;
  fecha_inicio: string;
  fecha_fin: string;
  meses: number;
  valor_mensual: number;
  valor_total: number;
  franja_riesgo_inferior: number;
  franja_riesgo_superior: number;
  valor_mensual_texto?: string;
  meses_texto?: string;
};

const currencyCO = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentCO = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtCurrency = (value: number) =>
  Number.isFinite(value) && value !== 0 ? currencyCO.format(value) : '—';

const fmtPercent = (value: number) =>
  Number.isFinite(value) ? percentCO.format(value) : '—';

type ExecutionSummary = {
  prestador: string;
  contrato: string;
  informes: number;
  total_ejecutado: number;
  total_valor_final: number;
  total_descontar: number;
  total_reconocer: number;
};

type ApiPayload = {
  source: string;
  spreadsheet_url: string;
  providers: string[];
  rows: ProviderRow[];
  execution_summary: ExecutionSummary[];
};

const NAVY = '#1F4E78';

export default function ExcelExportPage() {
  const router = useRouter();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      setIsCheckingAuth(true);
      try {
        const response = await fetch('/api/excel-export/auth', { cache: 'no-store' });
        setIsAuthenticated(response.ok);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchRows = async () => {
      setLoadingRows(true);
      setLoadError('');
      try {
        const response = await fetch('/api/excel-export/data', { cache: 'no-store' });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || 'No se pudieron cargar los datos.');
        }

        const typedData = data as ApiPayload;
        setPayload(typedData);
        setSelectedProvider(typedData.providers?.[0] || '');
      } catch (error: any) {
        setLoadError(error?.message || 'Error inesperado al cargar datos.');
      } finally {
        setLoadingRows(false);
      }
    };

    fetchRows();
  }, [isAuthenticated]);

  const selectedRows = useMemo(() => {
    if (!payload || !selectedProvider) return [];
    return payload.rows.filter((row) => row.prestador === selectedProvider);
  }, [payload, selectedProvider]);

  const selectedExecutionSummary = useMemo(() => {
    if (!payload || !selectedProvider) return [];
    return payload.execution_summary.filter((item) => item.prestador === selectedProvider);
  }, [payload, selectedProvider]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const response = await fetch('/api/excel-export/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setAuthError('Contraseña incorrecta.');
        return;
      }

      setIsAuthenticated(true);
      setPassword('');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/excel-export/auth', { method: 'DELETE' });
    setIsAuthenticated(false);
    setPayload(null);
    setSelectedProvider('');
  };

  const exportToExcel = async () => {
    if (!selectedProvider || !selectedRows.length) return;

    setIsExporting(true);
    setLoadError('');

    try {
      const response = await fetch('/api/excel-export/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prestador: selectedProvider,
          rows: selectedRows,
          execution_summary: selectedExecutionSummary,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'No fue posible exportar el archivo.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fallbackContract = selectedRows[0]?.contrato || 'SIN_CONTRATO';
      const fallbackName = `PGP_${fallbackContract}_${selectedProvider}.xlsx`;
      const fileName = match?.[1] || fallbackName;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      setLoadError(error?.message || 'No fue posible exportar el archivo.');
    } finally {
      setIsExporting(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-border">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-xl">Acceso protegido</CardTitle>
            <CardDescription>
              Ingresa la contraseña para ver y exportar prestadores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Contraseña</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
              {authError && <p className="text-sm text-destructive">{authError}</p>}
              <Button type="submit" className="w-full" disabled={authLoading}>
                {authLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                Ingresar
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-card flex items-center px-6 gap-3 sticky top-0 z-20">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Volver
        </Button>
        <div className="w-px h-5 bg-border" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: NAVY }}>
            <FileSpreadsheet className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">Exportación Excel PGP</p>
            <p className="text-xs text-muted-foreground">Simple: escoger prestador → ver datos → descargar</p>
          </div>
        </div>

        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleLogout}>Cerrar acceso</Button>
        </div>
      </header>

      <main className="p-6 space-y-4">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Prestador</CardTitle>
            <CardDescription>
              Selecciona un prestador para ver sus datos del Google Sheet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingRows ? (
              <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cargando prestadores...
              </div>
            ) : !payload ? (
              <p className="text-sm text-muted-foreground">No hay información para mostrar.</p>
            ) : (
              <>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger className="max-w-xl">
                    <SelectValue placeholder="Selecciona un prestador" />
                  </SelectTrigger>
                  <SelectContent>
                    {payload.providers.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={exportToExcel}
                    disabled={!selectedRows.length || isExporting}
                    style={{ backgroundColor: NAVY }}
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1.5" />
                    )}
                    Descargar Excel
                  </Button>
                </div>
              </>
            )}

            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del prestador</CardTitle>
            <CardDescription>
              Campos base y relación de ejecución (si existe en Supabase) para el prestador seleccionado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedRows.length ? (
              <p className="text-sm text-muted-foreground">Selecciona un prestador para ver la tabla.</p>
            ) : (
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow style={{ backgroundColor: NAVY }}>
                      {[
                        'NIT',
                        'PRESTADOR',
                        'ID DE ZONA',
                        'WEB',
                        'POBLACION',
                        'CONTRATO',
                        'CIUDAD',
                        'DEPARTAMENTO',
                        'FECHA INICIO',
                        'FECHA FIN',
                        'VALOR MENSUAL',
                        'MESES',
                        'VALOR TOTAL CONTRATO',
                        'FRANJA RIESGO INFERIOR (90%)',
                        'FRANJA RIESGO SUPERIOR (110%)',
                      ].map((head) => (
                        <TableHead key={head} className="text-white whitespace-nowrap">
                          {head}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRows.map((row, index) => (
                      <TableRow key={`${row.contrato}-${index}`}>
                        <TableCell>{row.nit || '—'}</TableCell>
                        <TableCell>{row.prestador || '—'}</TableCell>
                        <TableCell>{row.id_zona || '—'}</TableCell>
                        <TableCell>
                          {row.web ? (
                            <a
                              href={row.web}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {row.web}
                            </a>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>{row.poblacion || '—'}</TableCell>
                        <TableCell>{row.contrato || '—'}</TableCell>
                        <TableCell>{row.ciudad || '—'}</TableCell>
                        <TableCell>{row.departamento || '—'}</TableCell>
                        <TableCell>{row.fecha_inicio || '—'}</TableCell>
                        <TableCell>{row.fecha_fin || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtCurrency(row.valor_mensual)}</TableCell>
                        <TableCell>{row.meses || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap font-semibold">{fmtCurrency(row.valor_total)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtCurrency(row.franja_riesgo_inferior)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtCurrency(row.franja_riesgo_superior)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedRows.length > 0 && selectedExecutionSummary.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ejecución vs. Valor Esperado</CardTitle>
              <CardDescription>
                Porcentaje de ejecución calculado como (Valor Ejecutado / Valor Esperado) × 100%.
                El valor esperado corresponde a: valor mensual × número de informes mensuales cargados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow style={{ backgroundColor: NAVY }}>
                      {[
                        'CONTRATO',
                        'INFORMES',
                        'VALOR MENSUAL',
                        'VALOR ESPERADO',
                        'VALOR EJECUTADO',
                        '% EJECUCIÓN',
                        'VALOR FINAL',
                        'DESCONTAR',
                        'RECONOCER',
                      ].map((head) => (
                        <TableHead key={head} className="text-white whitespace-nowrap">
                          {head}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedExecutionSummary.map((item, index) => {
                      const mensual = selectedRows[0]?.valor_mensual || 0;
                      const esperado = mensual * (item.informes || 0);
                      const pct = esperado > 0 ? item.total_ejecutado / esperado : 0;
                      return (
                        <TableRow key={`${item.contrato}-${index}`}>
                          <TableCell>{item.contrato || '—'}</TableCell>
                          <TableCell>{item.informes}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtCurrency(mensual)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtCurrency(esperado)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtCurrency(item.total_ejecutado)}</TableCell>
                          <TableCell className="whitespace-nowrap font-semibold">
                            {esperado > 0 ? fmtPercent(pct) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{fmtCurrency(item.total_valor_final)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtCurrency(item.total_descontar)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtCurrency(item.total_reconocer)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
