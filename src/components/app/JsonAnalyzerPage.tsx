
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import FileUpload from "@/components/json-analyzer/FileUpload";
import DataVisualizer, { calculateSummary } from "@/components/json-analyzer/DataVisualizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, Building, Loader2, RefreshCw, AlertTriangle, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { fetchSheetData, type PrestadorInfo } from '@/lib/sheets';
import { type CupCountsMap, type CupCountInfo, type ExecutionDataByMonth } from '@/app/page';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export interface MonthlyExecutionData {
  cupCounts: CupCountsMap;
  summary: any;
  totalRealValue: number; 
  rawJsonData: any;
}

export interface SavedAuditData {
  adjustedQuantities: Record<string, number>;
  comments: Record<string, string>;
  selectedRows: Record<string, boolean>;
  executionData?: any; 
  jsonPrestadorCode?: string | null;
  uniqueUserCount?: number;
  pgpData?: any[];
  selectedPrestador?: any;
}

export const serializeExecutionData = (data: ExecutionDataByMonth): any => {
  const obj: any = {};
  data.forEach((monthData, monthKey) => {
    const serializedCupCounts: any = {};
    monthData.cupCounts.forEach((cupData, cupKey) => {
      serializedCupCounts[cupKey] = {
        ...cupData,
        diagnoses: Object.fromEntries(cupData.diagnoses),
        uniqueUsers: Array.from(cupData.uniqueUsers)
      };
    });
    obj[monthKey] = {
      ...monthData,
      cupCounts: serializedCupCounts
    };
  });
  return obj;
};

export const deserializeExecutionData = (obj: any): ExecutionDataByMonth => {
  const map: ExecutionDataByMonth = new Map();
  Object.entries(obj).forEach(([monthKey, monthData]: [string, any]) => {
    const cupCountsMap: CupCountsMap = new Map();
    Object.entries(monthData.cupCounts).forEach(([cupKey, cupData]: [string, any]) => {
      cupCountsMap.set(cupKey, {
        ...cupData,
        diagnoses: new Map(Object.entries(cupData.diagnoses)),
        uniqueUsers: new Set(cupData.uniqueUsers)
      });
    });
    map.set(monthKey, {
      ...monthData,
      cupCounts: cupCountsMap
    });
  });
  return map;
};

export interface RegimenTotals {
  subsidiado: number;
  contributivo: number;
  byMonth: Record<string, { subsidiado: number; contributivo: number }>;
  subsidiadoUsers: number;
  contributivoUsers: number;
}

interface JsonAnalyzerPageProps {
  setExecutionData: (data: ExecutionDataByMonth) => void;
  setJsonPrestadorCode: (code: string | null) => void;
  setUniqueUserCount: (count: number) => void;
  setRegimenTotals?: (totals: RegimenTotals) => void;
}

const PROVIDERS_SHEET_URL = "https://docs.google.com/spreadsheets/d/10Icu1DO4llbolO60VsdFcN5vxuYap1vBZs6foZ-XD04/edit?gid=0#gid=0";

const normalizeString = (v: unknown): string => String(v ?? "").trim();
const normalizeDigits = (v: unknown): string => {
    const digitsOnly = String(v ?? "").trim().replace(/\s+/g, "").replace(/\D/g, "");
    if (!digitsOnly) return "";
    return parseInt(digitsOnly, 10).toString();
};

export const getNumericValue = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const valueStr = String(value);
    const cleanedString = valueStr.replace(/[^0-9,.-]/g, '');
    const lastComma = cleanedString.lastIndexOf(',');
    const lastDot = cleanedString.lastIndexOf('.');
    let numberString: string;
    if (lastComma > lastDot) {
        numberString = cleanedString.replace(/\./g, '').replace(',', '.');
    } else {
        numberString = cleanedString.replace(/,/g, '');
    }
    const n = parseFloat(numberString);
    return isNaN(n) ? 0 : n;
};

const sanitizeForFilename = (v: string): string =>
  v.normalize('NFD').replace(/[\u0300Host\u036f]/g, '').replace(/[^\w.-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

const buildFileNameWithPrestador = (originalName: string, prestadorCodeRaw: string | null): string => {
  const code = sanitizeForFilename(normalizeString(prestadorCodeRaw ?? ''));
  if (!code) return originalName;
  const lowerOrig = originalName.toLowerCase();
  if (lowerOrig.startsWith(`${code.toLowerCase()}__`) || lowerOrig.includes(`${code.toLowerCase()}__`)) {
    return originalName;
  }
  return `${code}__${originalName}`;
};

async function fetchProvidersData(): Promise<Map<string, PrestadorInfo>> {
  const providersList = await fetchSheetData<PrestadorInfo>(PROVIDERS_SHEET_URL);
  const map = new Map<string, PrestadorInfo>();
  providersList.forEach(provider => {
    const key = normalizeDigits(provider['ID DE ZONA']);
    if (key) {
      const cleanedProvider: PrestadorInfo = {
        'NIT': normalizeString(provider.NIT),
        'PRESTADOR': normalizeString(provider.PRESTADOR),
        'ID DE ZONA': key,
        'WEB': normalizeString(provider.WEB),
        'POBLACION': getNumericValue(provider.POBLACION),
      };
      map.set(key, cleanedProvider);
    }
  });
  return map;
}

const findValueByKeyCaseInsensitive = (obj: any, key: string): string | null => {
  if (!obj || typeof obj !== 'object') return null;
  const keyToFind = key.toLowerCase();
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && k.toLowerCase() === keyToFind) {
      return obj[k];
    }
  }
  return null;
};

const getCodPrestadorFromJson = (jsonData: any): string | null => {
  if (!jsonData || !Array.isArray(jsonData.usuarios) || jsonData.usuarios.length === 0) {
    return null;
  }
  let prestadorCodeRaw: string | null = null;
  try {
    prestadorCodeRaw = jsonData.usuarios[0]?.servicios?.consultas?.[0]?.codPrestador;
    if (prestadorCodeRaw) return normalizeDigits(prestadorCodeRaw);
  } catch (e) {}
  try {
     prestadorCodeRaw = jsonData.usuarios[0]?.servicios?.procedimientos?.[0]?.codPrestador;
     if (prestadorCodeRaw) return normalizeDigits(prestadorCodeRaw);
  } catch (e) {}
  prestadorCodeRaw = findValueByKeyCaseInsensitive(jsonData, 'codPrestador');
  return prestadorCodeRaw ? normalizeDigits(prestadorCodeRaw) : null;
};

export const calculateCupCounts = (jsonData: any): CupCountsMap => {
    const counts: CupCountsMap = new Map();
    if (!jsonData || !jsonData.usuarios) return counts;
    jsonData.usuarios.forEach((user: any) => {
        const userId = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
        if (!userId || userId === '-') return;
        const processServices = (services: any[], codeField: string, dField: string, isProcedure = false, qtyField?: string, valueField: string = 'vrServicio', unitValueField?: string, type: "Consulta" | "Procedimiento" | "Medicamento" | "Otro Servicio" = "Procedimiento") => {
            if (!services) return;
            const uniqueProceduresForUser = new Set<string>();
            services.forEach(service => {
                const code = service[codeField];
                if (!code) return;
                let quantity = 1;
                let value = 0;
                if (isProcedure) {
                    const uniqueKey = `${service.codProcedimiento}|${service.fechaInicioAtencion}`;
                    if (uniqueProceduresForUser.has(uniqueKey)) {
                        quantity = 0;
                    } else {
                        uniqueProceduresForUser.add(uniqueKey);
                        quantity = 1;
                    }
                } else if (qtyField) {
                     quantity = getNumericValue(service[qtyField]);
                }
                const valueQuantity = qtyField ? getNumericValue(service[qtyField]) : 1;
                if (unitValueField) {
                    value = valueQuantity * getNumericValue(service[unitValueField]);
                } else {
                    value = getNumericValue(service[valueField]);
                }
                if (!counts.has(code)) {
                    counts.set(code, { total: 0, diagnoses: new Map(), totalValue: 0, uniqueUsers: new Set(), type });
                }
                const cupData = counts.get(code)!;
                cupData.total += quantity;
                cupData.totalValue += value;
                cupData.uniqueUsers.add(userId);
                
                // Captura descripción desde el JSON para todos los tipos de servicio
                if (!cupData.jsonDescription) {
                    const jsonName =
                        service.nomTecnologiaSalud ||   // Medicamentos / Otros Servicios
                        service.nomProcedimiento ||      // Procedimientos
                        service.nomConsulta ||           // Consultas
                        service.descripcion ||
                        service.nombre ||
                        service.nomServicio;
                    if (jsonName) cupData.jsonDescription = String(jsonName);
                }

                const diagnosis = service[dField];
                if (diagnosis) {
                    cupData.diagnoses.set(diagnosis, (cupData.diagnoses.get(diagnosis) || 0) + quantity);
                }
            });
        };
        if (user.servicios) {
            processServices(user.servicios.consultas, 'codConsulta', 'codDiagnosticoPrincipal', false, undefined, 'vrServicio', undefined, 'Consulta');
            processServices(user.servicios.procedimientos, 'codProcedimiento', 'codDiagnosticoPrincipal', true, undefined, 'vrServicio', undefined, 'Procedimiento');
            processServices(user.servicios.medicamentos, 'codTecnologiaSalud', 'codDiagnosticoPrincipal', false, 'cantidadMedicamento', undefined, 'vrUnitarioMedicamento', 'Medicamento');
            processServices(user.servicios.otrosServicios, 'codTecnologiaSalud', 'codDiagnosticoPrincipal', false, 'cantidadOS', 'vrServicio', undefined, 'Otro Servicio');
        }
    });
    return counts;
};

const extractMostFrequentMonth = (jsonData: any): string | null => {
    if (!jsonData || !jsonData.usuarios) return null;
    const monthCounts: Record<string, number> = {};
    jsonData.usuarios.forEach((user: any) => {
        const services = [...(user.servicios?.consultas || []), ...(user.servicios?.procedimientos || []), ...(user.servicios?.medicamentos || []), ...(user.servicios?.otrosServicios || [])];
        services.forEach((s: any) => {
            const dateStr = s.fechaInicioAtencion || s.fechaAtencion || s.fechaFactura;
            if (dateStr) {
                let month: number | null = null;
                if (dateStr.includes('-')) {
                    month = new Date(dateStr).getUTCMonth() + 1;
                } else if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    if (parts.length >= 2) month = parseInt(parts[1], 10);
                }
                if (month && !isNaN(month) && month >= 1 && month <= 12) {
                    const mKey = String(month);
                    monthCounts[mKey] = (monthCounts[mKey] || 0) + 1;
                }
            }
        });
    });
    let maxCount = 0;
    let suggestedMonth: string | null = null;
    for (const [m, count] of Object.entries(monthCounts)) {
        if (count > maxCount) {
            maxCount = count;
            suggestedMonth = m;
        }
    }
    return suggestedMonth;
};

export default function JsonAnalyzerPage({ setExecutionData, setJsonPrestadorCode, setUniqueUserCount, setRegimenTotals }: JsonAnalyzerPageProps) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Map<string, PrestadorInfo> | null>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState<boolean>(true);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [localRegimenTotals, setLocalRegimenTotals] = useState<RegimenTotals>({ subsidiado: 0, contributivo: 0, byMonth: {}, subsidiadoUsers: 0, contributivoUsers: 0 });

  const filesByMonth = useMemo(() => {
    return files.reduce((acc, file) => {
      const monthFiles = acc.get(file.month) || [];
      monthFiles.push(file);
      acc.set(file.month, monthFiles);
      return acc;
    }, new Map<string, FileState[]>());
  }, [files]);

  // Detecta régimen: con 1 archivo = Subsidiado; con 2+ el mayor en usuarios = Subsidiado
  const regimenByKey = useMemo(() => {
    const map = new Map<string, 'Subsidiado' | 'Contributivo'>();
    if (files.length === 1) {
      map.set(`${files[0].month}-${files[0].fileName}`, 'Subsidiado');
    } else if (files.length >= 2) {
      const sorted = [...files].sort((a, b) => (b.jsonData?.usuarios?.length || 0) - (a.jsonData?.usuarios?.length || 0));
      const mid = Math.ceil(sorted.length / 2);
      sorted.forEach((f, i) => {
        map.set(`${f.month}-${f.fileName}`, i < mid ? 'Subsidiado' : 'Contributivo');
      });
    }
    return map;
  }, [files]);

  useEffect(() => { setIsClient(true); }, []);

  const handleLoadProviders = useCallback(async () => {
    setIsLoadingProviders(true);
    try {
      const providersMap = await fetchProvidersData();
      setProviders(providersMap);
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsLoadingProviders(false);
    }
  }, []);

  useEffect(() => {
    if (isClient) handleLoadProviders();
  }, [isClient, handleLoadProviders]);

  const getMonthName = (monthNumber: string) => {
    const date = new Date(2024, parseInt(monthNumber) - 1, 1);
    const name = date.toLocaleString('es-CO', { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const handleFileLoad = useCallback((loadedFiles: File[]) => {
    setError(null);
    if (files.length + loadedFiles.length > 50) {
      toast({ title: 'Límite excedido', description: `Máximo 50 archivos.`, variant: 'destructive' });
      return;
    }
    const filePromises = loadedFiles.map(file => {
      return new Promise<FileState>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
          try {
            const content = e.target.result as string;
            const parsedJson = JSON.parse(content);
            const prestadorCode = getCodPrestadorFromJson(parsedJson);
            const prestadorInfo = (prestadorCode && providers?.get(prestadorCode)) || null;
            const finalName = buildFileNameWithPrestador(file.name, prestadorCode);
            const suggested = extractMostFrequentMonth(parsedJson);
            let targetMonth = suggested || selectedMonth;
            if (suggested) {
                toast({ title: "Mes detectado", description: `${file.name} asignado a ${getMonthName(suggested)}.` });
            }
            resolve({ jsonData: parsedJson, fileName: finalName, prestadorInfo: prestadorInfo, month: targetMonth });
          } catch (err: any) {
            reject(err);
          }
        };
        reader.readAsText(file);
      });
    });
    Promise.all(filePromises).then(processedFiles => {
      setFiles(prevFiles => [...prevFiles, ...processedFiles]);
    });
  }, [providers, toast, selectedMonth, files.length]);

  useEffect(() => {
    const allUsersCombined = files.flatMap(file => file.jsonData?.usuarios || []);
    const uniqueUserIdentifiers = new Set<string>();
    allUsersCombined.forEach((user: any) => {
        const id = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
        if (id && id !== '-') uniqueUserIdentifiers.add(id);
    });
    setUniqueUserCount(uniqueUserIdentifiers.size);

    const dataByMonth: ExecutionDataByMonth = new Map();
    filesByMonth.forEach((monthFiles, month) => {
        const combinedJsonDataForMonth = { usuarios: monthFiles.flatMap(f => f.jsonData?.usuarios || []) };
        const monthCupCounts = calculateCupCounts(combinedJsonDataForMonth);
        let monthTotalRealValue = 0;
        monthCupCounts.forEach(cupData => { monthTotalRealValue += cupData.totalValue; });
        const combinedSummary = calculateSummary(combinedJsonDataForMonth);
        combinedSummary.numFactura = monthFiles.length > 1 ? `Combinado (${monthFiles.length} archivos)` : (monthFiles.length > 0 ? monthFiles[0].fileName : 'N/A');
        dataByMonth.set(month, { cupCounts: monthCupCounts, summary: combinedSummary, totalRealValue: monthTotalRealValue, rawJsonData: combinedJsonDataForMonth });
    });
    setExecutionData(dataByMonth);
    setJsonPrestadorCode(files.length > 0 ? getCodPrestadorFromJson(files[0].jsonData) : null);

    // Calcula totales por régimen: usa proporción de usuarios para dividir totalRealValue del mes
    let sub = 0, con = 0, subUsers = 0, conUsers = 0;
    const regimenByMonth: Record<string, { subsidiado: number; contributivo: number }> = {};
    // Conteo de usuarios por régimen (siempre correcto, independiente de vrServicio)
    files.forEach(f => {
      const key = `${f.month}-${f.fileName}`;
      const reg = regimenByKey.get(key);
      if (!reg) return;
      const count = f.jsonData?.usuarios?.length || 0;
      if (reg === 'Subsidiado') subUsers += count;
      else conUsers += count;
    });
    // División proporcional del valor ejecutado real por mes
    filesByMonth.forEach((monthFiles, month) => {
      const monthData = dataByMonth.get(month);
      if (!monthData) return;
      const mName = new Date(2024, parseInt(month) - 1, 1)
        .toLocaleString('es-CO', { month: 'long' })
        .replace(/^\w/, c => c.toUpperCase());
      if (!regimenByMonth[mName]) regimenByMonth[mName] = { subsidiado: 0, contributivo: 0 };
      const totalMonthUsers = monthFiles.reduce((acc, f) => acc + (f.jsonData?.usuarios?.length || 0), 0);
      if (totalMonthUsers === 0) return;
      monthFiles.forEach(f => {
        const key = `${f.month}-${f.fileName}`;
        const reg = regimenByKey.get(key);
        if (!reg) return;
        const fileUsers = f.jsonData?.usuarios?.length || 0;
        const value = monthData.totalRealValue * (fileUsers / totalMonthUsers);
        if (reg === 'Subsidiado') { sub += value; regimenByMonth[mName].subsidiado += value; }
        else { con += value; regimenByMonth[mName].contributivo += value; }
      });
    });
    const regimenResult = { subsidiado: sub, contributivo: con, byMonth: regimenByMonth, subsidiadoUsers: subUsers, contributivoUsers: conUsers };
    setLocalRegimenTotals(regimenResult);
    if (setRegimenTotals) setRegimenTotals(regimenResult);
  }, [files, filesByMonth, setExecutionData, setJsonPrestadorCode, setUniqueUserCount, setRegimenTotals, regimenByKey]);

  const handleReset = () => {
    setFiles([]);
    setExecutionData(new Map());
    setJsonPrestadorCode(null);
    setUniqueUserCount(0);
  };

  if (!isClient) return <div className="flex items-center justify-center py-6"><Loader2 className="mr-2 h-6 w-6 animate-spin" /><p>Cargando...</p></div>;

  return (
    <div className="w-full space-y-8 mt-4">
      <Card className="w-full shadow-lg">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Carga tus Archivos JSON</CardTitle>
              <CardDescription>Arrastra múltiples archivos. El sistema los organizará por mes automáticamente.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px]">
                  <Calendar className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Mes por defecto..." />
                </SelectTrigger>
                <SelectContent>
                  {[...Array(12).keys()].map(i => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{getMonthName(String(i + 1))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {files.length > 0 && <Button onClick={handleReset} variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Limpiar</Button>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FileUpload onFileLoad={handleFileLoad} disabled={isLoadingProviders} loadedFileNames={files.map(f => `${f.fileName} (${getMonthName(f.month)})`)} maxFiles={50} />
        </CardContent>
      </Card>

      {files.length >= 1 && (localRegimenTotals.subsidiado > 0 || localRegimenTotals.contributivo > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-5 flex flex-col gap-1">
            <p className="text-sm font-semibold text-blue-700 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-600"></span>
              Subsidiado — Ejecución Real (JSON)
            </p>
            <p className="text-2xl font-bold text-blue-900">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(localRegimenTotals.subsidiado)}</p>
            <p className="text-xs text-blue-600">Archivo con mayor número de usuarios</p>
          </div>
          <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-5 flex flex-col gap-1">
            <p className="text-sm font-semibold text-orange-700 flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-orange-500"></span>
              Contributivo — Ejecución Real (JSON)
            </p>
            <p className="text-2xl font-bold text-orange-900">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(localRegimenTotals.contributivo)}</p>
            <p className="text-xs text-orange-600">Archivo con menor número de usuarios</p>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-center">Resultados por Mes</h3>
          {Array.from(filesByMonth.entries()).map(([month, monthFiles]) => (
            <div key={month} className="space-y-4">
                <h4 className="text-lg font-bold border-b pb-2 flex items-center"><Calendar className="mr-2 h-5 w-5 text-primary" />{getMonthName(month)} ({monthFiles.length} archivos)</h4>
                {monthFiles.map((file, index) => {
                    const regimen = regimenByKey.get(`${file.month}-${file.fileName}`);
                    return file.jsonData && (
                    <Card key={index} className="shadow-md">
                    <Accordion type="single" collapsible>
                        <AccordionItem value={`item-${index}`}>
                        <AccordionTrigger className="p-6">
                            <div className="flex flex-col items-start text-left gap-1">
                            <div className="flex items-center gap-2">
                                <h4 className="text-lg font-bold text-foreground"><Building className="inline-block mr-2 h-5 w-5 text-primary" />{file.prestadorInfo ? file.prestadorInfo.PRESTADOR : `Prestador código ${getCodPrestadorFromJson(file.jsonData) || 'desconocido'}`}</h4>
                                {regimen && (
                                  <Badge className={regimen === 'Subsidiado' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-orange-500 text-white hover:bg-orange-600'}>
                                    {regimen}
                                  </Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground">NIT: {file.prestadorInfo?.NIT || findValueByKeyCaseInsensitive(file.jsonData, 'numDocumentoIdObligado')} | Archivo: {file.fileName} | Usuarios: {file.jsonData?.usuarios?.length || 0}</p>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-6 pt-0"><DataVisualizer data={file.jsonData} /></AccordionContent>
                        </AccordionItem>
                    </Accordion>
                    </Card>
                );
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FileState {
  jsonData: any | null;
  fileName: string | null;
  prestadorInfo: PrestadorInfo | null;
  month: string;
  regimen?: 'Subsidiado' | 'Contributivo';
}
