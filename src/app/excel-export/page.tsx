'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Filter,
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type JsonValue = string | number | boolean | null;
type DataRow = Record<string, JsonValue>;

type ApiPayload = {
  source: string;
  contract_name: string;
  rows: DataRow[];
  dataset: {
    contract: DataRow;
    services: DataRow[];
    monthlyTracking: DataRow[];
    quarterlyTracking: DataRow[];
    annualClosing: DataRow[];
    monthlyAlerts: DataRow[];
    quarterlyAlerts: DataRow[];
    instructions: DataRow[];
  };
};

const NAVY = '#1F4E78';
const YELLOW = '#FFF2CC';
const GREEN = '#E2EFDA';

const toText = (value: JsonValue): string => (value === null || value === undefined ? '' : String(value));

const formatCurrency = (value: JsonValue) => {
  if (typeof value !== 'number') return toText(value) || '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(value);
};

const formatPercent = (value: JsonValue) => {
  if (typeof value !== 'number') return toText(value) || '—';
  return `${(value * 100).toFixed(2)}%`;
};

const parseYear = (value: JsonValue): string => {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
};

export default function ExcelExportPage() {
  const router = useRouter();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [searchNit, setSearchNit] = useState('');
  const [searchContract, setSearchContract] = useState('');
  const [searchCups, setSearchCups] = useState('');
  const [searchDescription, setSearchDescription] = useState('');
  const [searchObservation, setSearchObservation] = useState('');

  const [selectedMonth, setSelectedMonth] = useState<string>('todos');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('todos');
  const [selectedRegimen, setSelectedRegimen] = useState<string>('todos');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('todos');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [selectedYear, setSelectedYear] = useState<string>('todos');

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
          throw new Error(data?.message || 'No se pudieron cargar los datos de VITAL SALUD SM.xlsx.');
        }

        setPayload(data as ApiPayload);
      } catch (error: any) {
        setLoadError(error?.message || 'Error inesperado al cargar datos.');
      } finally {
        setLoadingRows(false);
      }
    };

    fetchRows();
  }, [isAuthenticated]);

  const rows = payload?.rows ?? [];

  const monthOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => toText(row.mes)).filter(Boolean))),
    [rows]
  );

  const quarterOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => toText(row.trimestre)).filter(Boolean))),
    [rows]
  );

  const regimenOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => toText(row.regimen)).filter(Boolean))),
    [rows]
  );

  const departmentOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => toText(row.departamento)).filter(Boolean))),
    [rows]
  );

  const municipalityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .flatMap((row) => toText(row.municipio).split(','))
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ),
    [rows]
  );

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => toText(row.estado_cumplimiento)).filter(Boolean))),
    [rows]
  );

  const yearOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => parseYear(row.vigencia_anio)).filter(Boolean))),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const nit = toText(row.nit_entidad).toLowerCase();
      const contract = toText(row.numero_contrato).toLowerCase();
      const cups = toText(row.codigo_cups).toLowerCase();
      const description = toText(row.descripcion_servicio).toLowerCase();
      const observation = toText(row.observaciones).toLowerCase();
      const month = toText(row.mes);
      const quarter = toText(row.trimestre);
      const regimen = toText(row.regimen);
      const department = toText(row.departamento);
      const municipality = toText(row.municipio);
      const status = toText(row.estado_cumplimiento);
      const year = parseYear(row.vigencia_anio);

      if (searchNit && !nit.includes(searchNit.toLowerCase())) return false;
      if (searchContract && !contract.includes(searchContract.toLowerCase())) return false;
      if (searchCups && !cups.includes(searchCups.toLowerCase())) return false;
      if (searchDescription && !description.includes(searchDescription.toLowerCase())) return false;
      if (searchObservation && !observation.includes(searchObservation.toLowerCase())) return false;

      if (selectedMonth !== 'todos' && month !== selectedMonth) return false;
      if (selectedQuarter !== 'todos' && quarter !== selectedQuarter) return false;
      if (selectedRegimen !== 'todos' && regimen !== selectedRegimen) return false;
      if (selectedDepartment !== 'todos' && department !== selectedDepartment) return false;
      if (selectedMunicipality !== 'todos' && !municipality.includes(selectedMunicipality)) return false;
      if (selectedStatus !== 'todos' && status !== selectedStatus) return false;
      if (selectedYear !== 'todos' && year !== selectedYear) return false;

      return true;
    });
  }, [
    rows,
    searchNit,
    searchContract,
    searchCups,
    searchDescription,
    searchObservation,
    selectedMonth,
    selectedQuarter,
    selectedRegimen,
    selectedDepartment,
    selectedMunicipality,
    selectedStatus,
    selectedYear,
  ]);

  const servicesFiltered = useMemo(
    () => filteredRows.filter((row) => row.record_type === 'servicio'),
    [filteredRows]
  );
  const monthlyFiltered = useMemo(
    () => filteredRows.filter((row) => row.record_type === 'mensual'),
    [filteredRows]
  );
  const quarterlyFiltered = useMemo(
    () => filteredRows.filter((row) => row.record_type === 'trimestral'),
    [filteredRows]
  );
  const annualFiltered = useMemo(
    () => filteredRows.filter((row) => row.record_type === 'cierre_anual'),
    [filteredRows]
  );
  const alertMonthlyFiltered = useMemo(
    () => filteredRows.filter((row) => row.record_type === 'alerta_mensual'),
    [filteredRows]
  );

  const clearFilters = () => {
    setSearchNit('');
    setSearchContract('');
    setSearchCups('');
    setSearchDescription('');
    setSearchObservation('');
    setSelectedMonth('todos');
    setSelectedQuarter('todos');
    setSelectedRegimen('todos');
    setSelectedDepartment('todos');
    setSelectedMunicipality('todos');
    setSelectedStatus('todos');
    setSelectedYear('todos');
  };

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
    clearFilters();
  };

  const exportToExcel = async () => {
    if (!filteredRows.length) return;

    const response = await fetch('/api/excel-export/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: filteredRows }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setLoadError(data?.message || 'No fue posible exportar el archivo.');
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vital-salud-sm-filtrado-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
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
              Ingresa la contraseña para ver y exportar únicamente datos de VITAL SALUD SM.
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
            <p className="font-semibold text-sm">Exportación VITAL SALUD SM</p>
            <p className="text-xs text-muted-foreground">Sin auditorías · Búsqueda avanzada · Filtros · Exportación .xlsx</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">{filteredRows.length} de {rows.length} filas</Badge>
          <Button variant="outline" size="sm" onClick={handleLogout}>Cerrar acceso</Button>
        </div>
      </header>

      <main className="p-6 space-y-4">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Búsqueda avanzada</CardTitle>
            <CardDescription>Busca por NIT, contrato, CUPS, descripción y observaciones.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <Input value={searchNit} onChange={(e) => setSearchNit(e.target.value)} placeholder="NIT entidad" style={{ backgroundColor: YELLOW }} />
              <Input value={searchContract} onChange={(e) => setSearchContract(e.target.value)} placeholder="Número de contrato" style={{ backgroundColor: YELLOW }} />
              <Input value={searchCups} onChange={(e) => setSearchCups(e.target.value)} placeholder="Código CUPS" style={{ backgroundColor: YELLOW }} />
              <Input value={searchDescription} onChange={(e) => setSearchDescription(e.target.value)} placeholder="Descripción de servicios" style={{ backgroundColor: YELLOW }} />
              <Input value={searchObservation} onChange={(e) => setSearchObservation(e.target.value)} placeholder="Observaciones" style={{ backgroundColor: YELLOW }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> Filtros</CardTitle>
            <CardDescription>Mes/Trimestre, régimen, departamento/municipio, estado de cumplimiento y vigencia.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger style={{ backgroundColor: YELLOW }}><SelectValue placeholder="Mes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los meses</SelectItem>
                  {monthOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger style={{ backgroundColor: YELLOW }}><SelectValue placeholder="Trimestre" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los trimestres</SelectItem>
                  {quarterOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={selectedRegimen} onValueChange={setSelectedRegimen}>
                <SelectTrigger style={{ backgroundColor: YELLOW }}><SelectValue placeholder="Régimen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los regímenes</SelectItem>
                  {regimenOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger style={{ backgroundColor: YELLOW }}><SelectValue placeholder="Departamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los departamentos</SelectItem>
                  {departmentOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={selectedMunicipality} onValueChange={setSelectedMunicipality}>
                <SelectTrigger style={{ backgroundColor: YELLOW }}><SelectValue placeholder="Municipio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los municipios</SelectItem>
                  {municipalityOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger style={{ backgroundColor: YELLOW }}><SelectValue placeholder="Estado de cumplimiento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  {statusOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger style={{ backgroundColor: YELLOW }}><SelectValue placeholder="Vigencia" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las vigencias</SelectItem>
                  {yearOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="flex gap-2 lg:col-span-1">
                <Button type="button" variant="outline" className="w-full" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1.5" /> Limpiar
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={exportToExcel} disabled={!filteredRows.length}>
                <Download className="h-4 w-4 mr-1.5" /> Exportar .xlsx
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estructura de tablas (Excel original)</CardTitle>
            <CardDescription>{payload?.source ?? 'Cargando...'} · Colores: azul #1F4E78, amarillo #FFF2CC, verde #E2EFDA</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRows ? (
              <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cargando datos del Excel...
              </div>
            ) : loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : !payload ? (
              <p className="text-sm text-muted-foreground">No hay información para mostrar.</p>
            ) : (
              <Tabs defaultValue="datos-contrato" className="w-full">
                <TabsList className="mb-3 flex flex-wrap h-auto justify-start">
                  <TabsTrigger value="datos-contrato">02 Datos Contrato</TabsTrigger>
                  <TabsTrigger value="nota-tecnica">03 Nota Técnica</TabsTrigger>
                  <TabsTrigger value="mensual">04 Seguimiento Mensual</TabsTrigger>
                  <TabsTrigger value="trimestral">05 Seguimiento Trimestral</TabsTrigger>
                  <TabsTrigger value="cierre">06 Cierre Anual</TabsTrigger>
                  <TabsTrigger value="alertas">07 Alertas Semáforo</TabsTrigger>
                </TabsList>

                <TabsContent value="datos-contrato">
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-2 text-white font-semibold" style={{ backgroundColor: NAVY }}>
                      DATOS GENERALES DEL CONTRATO PGP
                    </div>
                    <Table>
                      <TableBody>
                        {Object.entries(payload.dataset.contract).map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell className="font-medium w-[35%]">{key}</TableCell>
                            <TableCell style={{ backgroundColor: YELLOW }}>
                              {typeof value === 'number' ? formatCurrency(value) : toText(value) || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="nota-tecnica">
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow style={{ backgroundColor: NAVY }}>
                          {['Ítem', 'Código CUPS', 'Descripción', 'Frecuencia anual', 'Tarifa', 'Valor anual', 'Valor mensual', '% contrato'].map((head) => (
                            <TableHead key={head} className="text-white whitespace-nowrap">{head}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {servicesFiltered.map((row, index) => (
                          <TableRow key={`service-${index}`}>
                            <TableCell>{toText(row.item) || '—'}</TableCell>
                            <TableCell style={{ backgroundColor: YELLOW }}>{toText(row.codigo_cups) || '—'}</TableCell>
                            <TableCell style={{ backgroundColor: YELLOW }}>{toText(row.descripcion_servicio) || '—'}</TableCell>
                            <TableCell style={{ backgroundColor: YELLOW }}>{toText(row.frecuencia_anual) || '—'}</TableCell>
                            <TableCell style={{ backgroundColor: YELLOW }}>{formatCurrency(row.tarifa_unitaria)}</TableCell>
                            <TableCell>{formatCurrency(row.valor_anual)}</TableCell>
                            <TableCell>{formatCurrency(row.valor_mensual)}</TableCell>
                            <TableCell>{formatPercent(row.porcentaje_contrato)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow style={{ backgroundColor: GREEN }}>
                          <TableCell colSpan={5} className="font-semibold">Total filtrado</TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(servicesFiltered.reduce((acc, row) => acc + (typeof row.valor_anual === 'number' ? row.valor_anual : 0), 0))}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(servicesFiltered.reduce((acc, row) => acc + (typeof row.valor_mensual === 'number' ? row.valor_mensual : 0), 0))}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="mensual">
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow style={{ backgroundColor: NAVY }}>
                          {['#', 'Mes', 'Proyectado', 'Ejecutado', 'Desviación', '% cumplimiento', 'Estado', 'Acumulado', 'Observaciones'].map((head) => (
                            <TableHead key={head} className="text-white whitespace-nowrap">{head}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyFiltered.map((row, index) => (
                          <TableRow key={`monthly-${index}`}>
                            <TableCell>{toText(row.item) || '—'}</TableCell>
                            <TableCell>{toText(row.mes) || '—'}</TableCell>
                            <TableCell>{formatCurrency(row.valor_proyectado)}</TableCell>
                            <TableCell style={{ backgroundColor: YELLOW }}>{formatCurrency(row.valor_ejecutado)}</TableCell>
                            <TableCell>{formatCurrency(row.desviacion)}</TableCell>
                            <TableCell>{formatPercent(row.porcentaje_cumplimiento)}</TableCell>
                            <TableCell>{toText(row.estado_cumplimiento) || '—'}</TableCell>
                            <TableCell>{formatCurrency(row.ejecutado_acumulado)}</TableCell>
                            <TableCell style={{ backgroundColor: YELLOW }}>{toText(row.observaciones) || '—'}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow style={{ backgroundColor: GREEN }}>
                          <TableCell colSpan={2} className="font-semibold">Total filtrado</TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(monthlyFiltered.reduce((acc, row) => acc + (typeof row.valor_proyectado === 'number' ? row.valor_proyectado : 0), 0))}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(monthlyFiltered.reduce((acc, row) => acc + (typeof row.valor_ejecutado === 'number' ? row.valor_ejecutado : 0), 0))}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(monthlyFiltered.reduce((acc, row) => acc + (typeof row.desviacion === 'number' ? row.desviacion : 0), 0))}
                          </TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell />
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="trimestral">
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow style={{ backgroundColor: NAVY }}>
                          {['Trimestre', 'Meses', 'Proyectado', 'Ejecutado', '% cumplimiento', 'Límite 90%', 'Límite 110%', 'Estado', 'Faltante/Exceso', 'Descuento', 'Reconocimiento'].map((head) => (
                            <TableHead key={head} className="text-white whitespace-nowrap">{head}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quarterlyFiltered.map((row, index) => (
                          <TableRow key={`quarterly-${index}`}>
                            <TableCell>{toText(row.trimestre) || '—'}</TableCell>
                            <TableCell>{toText(row.meses) || '—'}</TableCell>
                            <TableCell>{formatCurrency(row.proyectado)}</TableCell>
                            <TableCell>{formatCurrency(row.ejecutado)}</TableCell>
                            <TableCell>{formatPercent(row.porcentaje_cumplimiento)}</TableCell>
                            <TableCell>{formatCurrency(row.limite_inferior)}</TableCell>
                            <TableCell>{formatCurrency(row.limite_superior)}</TableCell>
                            <TableCell>{toText(row.estado_cumplimiento) || '—'}</TableCell>
                            <TableCell>{formatCurrency(row.faltante_exceso)}</TableCell>
                            <TableCell>{formatCurrency(row.descuento)}</TableCell>
                            <TableCell>{formatCurrency(row.reconocimiento)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="cierre">
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow style={{ backgroundColor: NAVY }}>
                          <TableHead className="text-white">Campo</TableHead>
                          <TableHead className="text-white">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {annualFiltered.map((row, index) => (
                          <TableRow key={`annual-${index}`}>
                            <TableCell>{toText(row.campo)}</TableCell>
                            <TableCell>{typeof row.valor === 'number' ? formatCurrency(row.valor) : toText(row.valor)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="alertas">
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow style={{ backgroundColor: NAVY }}>
                          {['Mes', '% cumplimiento', 'Estado', 'Desviación', 'Acción recomendada'].map((head) => (
                            <TableHead key={head} className="text-white">{head}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alertMonthlyFiltered.map((row, index) => (
                          <TableRow key={`alert-${index}`}>
                            <TableCell>{toText(row.mes)}</TableCell>
                            <TableCell>{formatPercent(row.porcentaje_cumplimiento)}</TableCell>
                            <TableCell>{toText(row.estado_cumplimiento)}</TableCell>
                            <TableCell>{formatCurrency(row.desviacion)}</TableCell>
                            <TableCell>{toText(row.accion_recomendada)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
