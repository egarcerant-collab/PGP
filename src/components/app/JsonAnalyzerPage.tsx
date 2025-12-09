
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import FileUpload from "@/components/json-analyzer/FileUpload";
import DataVisualizer, { calculateSummary } from "@/components/json-analyzer/DataVisualizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, Building, Loader2, RefreshCw, AlertTriangle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { fetchSheetData, type PrestadorInfo } from '@/lib/sheets';
import { type CupCountsMap, type CupCountInfo } from '@/app/page';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export interface MonthlyExecutionData {
  cupCounts: CupCountsMap;
  summary: any;
  totalRealValue: number; // Valor total real del JSON
  rawJsonData: any;
}

export type ExecutionDataByMonth = Map<string, MonthlyExecutionData>;


interface FileState {
  jsonData: any | null;
  fileName: string | null;
  prestadorInfo: PrestadorInfo | null;
  month: string;
}

interface JsonAnalyzerPageProps {
  setExecutionData: (data: ExecutionDataByMonth) => void;
  setJsonPrestadorCode: (code: string | null) => void;
  setUniqueUserCount: (count: number) => void;
}

const PROVIDERS_SHEET_URL = "https://docs.google.com/spreadsheets/d/10Icu1DO4llbolO60VsdFcN5vxuYap1vBZs6foZ-XD04/edit?gid=0#gid=0";

const normalizeString = (v: unknown): string => String(v ?? "").trim();
const normalizeDigits = (v: unknown): string => {
    const digitsOnly = String(v ?? "").trim().replace(/\s+/g, "").replace(/\D/g, "");
    if (!digitsOnly) return "";
    // Convert to number to remove leading zeros, then back to string.
    return parseInt(digitsOnly, 10).toString();
};


export const getNumericValue = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    
    // Convert to string and handle potential scientific notation or other formats
    const valueStr = String(value);

    // Clean the string: allow digits, minus sign, comma, and dot.
    const cleanedString = valueStr.replace(/[^0-9,.-]/g, '');

    const lastComma = cleanedString.lastIndexOf(',');
    const lastDot = cleanedString.lastIndexOf('.');

    let numberString: string;

    if (lastComma > lastDot) {
        // Format is likely 1.234,56 (Latin American). 
        // Remove dots (thousand separators), replace comma with dot (decimal separator).
        numberString = cleanedString.replace(/\./g, '').replace(',', '.');
    } else {
        // Format is likely 1,234.56 (American) or a plain number.
        // Remove commas (thousand separators). The dot is already the decimal separator.
        numberString = cleanedString.replace(/,/g, '');
    }
      
    const n = parseFloat(numberString);
    return isNaN(n) ? 0 : n;
};


const sanitizeForFilename = (v: string): string =>
  v
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

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

        const processServices = (services: any[], codeField: string, diagField: string, isProcedure = false, qtyField?: string, valueField: string = 'vrServicio', unitValueField?: string) => {
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
                        quantity = 0; // Don't count frequency for duplicates
                    } else {
                        uniqueProceduresForUser.add(uniqueKey);
                        quantity = 1; // Count frequency for the first time
                    }
                } else if (qtyField) {
                     quantity = getNumericValue(service[qtyField]);
                }
                
                // Always calculate value based on original quantity
                const valueQuantity = qtyField ? getNumericValue(service[qtyField]) : 1;
                if (unitValueField) {
                    value = valueQuantity * getNumericValue(service[unitValueField]);
                } else {
                    value = getNumericValue(service[valueField]);
                }


                if (!counts.has(code)) {
                    counts.set(code, { total: 0, diagnoses: new Map(), totalValue: 0, uniqueUsers: new Set() });
                }
                const cupData = counts.get(code)!;
                
                cupData.total += quantity;
                cupData.totalValue += value;
                cupData.uniqueUsers.add(userId);

                const diagnosis = service[diagField];
                if (diagnosis) {
                    cupData.diagnoses.set(diagnosis, (cupData.diagnoses.get(diagnosis) || 0) + quantity);
                }
            });
        };

        if (user.servicios) {
            processServices(user.servicios.consultas, 'codConsulta', 'codDiagnosticoPrincipal', false);
            processServices(user.servicios.procedimientos, 'codProcedimiento', 'codDiagnosticoPrincipal', true);
            processServices(user.servicios.medicamentos, 'codTecnologiaSalud', 'codDiagnosticoPrincipal', false, 'cantidadMedicamento', undefined, 'vrUnitarioMedicamento');
            processServices(user.servicios.otrosServicios, 'codTecnologiaSalud', 'codDiagnosticoPrincipal', false, 'cantidadOS', 'vrServicio');
        }
    });

    return counts;
};


export default function JsonAnalyzerPage({ setExecutionData, setJsonPrestadorCode, setUniqueUserCount }: JsonAnalyzerPageProps) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Map<string, PrestadorInfo> | null>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState<boolean>(true);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1));

  const filesByMonth = useMemo(() => {
    return files.reduce((acc, file) => {
      const monthFiles = acc.get(file.month) || [];
      monthFiles.push(file);
      acc.set(file.month, monthFiles);
      return acc;
    }, new Map<string, FileState[]>());
  }, [files]);

  const loadedMonthsCount = filesByMonth.size;
  const filesInCurrentMonth = filesByMonth.get(selectedMonth)?.length || 0;
  const canUploadForCurrentMonth = filesInCurrentMonth < 2;
  const canSelectNewMonth = loadedMonthsCount < 3 || filesByMonth.has(selectedMonth);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLoadProviders = useCallback(async () => {
    setIsLoadingProviders(true);
    setError(null);
    toast({ title: "Accediendo a la Base de Datos de Prestadores...", description: "Espere un momento, por favor." });
    try {
      const providersMap = await fetchProvidersData();
      if (providersMap.size === 0) {
        throw new Error("No se encontraron datos de prestadores. Verifique la hoja de cálculo.");
      }
      setProviders(providersMap);
      toast({ title: "Datos de Prestadores Cargados", description: `Se cargaron ${providersMap.size} registros.` });
    } catch (e: any) {
      const errorMessage = e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
      setError('Error al cargar la base de datos de prestadores: ' + errorMessage);
      toast({ title: "Error al Cargar Datos", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoadingProviders(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isClient) {
      handleLoadProviders();
    }
  }, [isClient, handleLoadProviders]);

  const handleFileLoad = useCallback((loadedFiles: File[]) => {
    setError(null);
    setShowDuplicateAlert(false);

    if (filesInCurrentMonth + loadedFiles.length > 2) {
      toast({ title: 'Límite de archivos excedido', description: `Solo puedes cargar un máximo de 2 archivos por mes.`, variant: 'destructive' });
      return;
    }

    if (loadedMonthsCount >= 3 && !filesByMonth.has(selectedMonth)) {
      toast({ title: 'Límite de meses alcanzado', description: `Solo puedes cargar archivos para un máximo de 3 meses distintos.`, variant: 'destructive' });
      return;
    }

    const filePromises = loadedFiles.map(file => {
      return new Promise<FileState>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
          if (!e.target?.result) return reject(new Error("No se pudo leer el archivo."));
          try {
            const content = e.target.result as string;
            const parsedJson = JSON.parse(content);
            const prestadorCode = getCodPrestadorFromJson(parsedJson);
            const prestadorInfo = (prestadorCode && providers?.get(prestadorCode)) || null;
            const finalName = buildFileNameWithPrestador(file.name, prestadorCode);

            resolve({
              jsonData: parsedJson,
              fileName: finalName,
              prestadorInfo: prestadorInfo,
              month: selectedMonth
            });

          } catch (err: any) {
            const errorMessage = err instanceof Error ? `Error al parsear ${file.name}: ${err.message}` : `Error inesperado al parsear ${file.name}.`;
            setError(prev => prev ? `${prev}\n${errorMessage}` : errorMessage);
            toast({ title: "Error de Archivo", description: errorMessage, variant: "destructive" });
            reject(err);
          }
        };
        reader.readAsText(file);
      });
    });

    Promise.all(filePromises).then(processedFiles => {
      setFiles(prevFiles => [...prevFiles, ...processedFiles]);
    });
  }, [providers, toast, selectedMonth, filesInCurrentMonth, loadedMonthsCount, filesByMonth]);

  useEffect(() => {
    // 1. Combine all users from all files into a single list
    const allUsersCombined = files.flatMap(file => file.jsonData?.usuarios || []);

    // 2. Calculate unique user count from the combined list
    const uniqueUserIdentifiers = new Set<string>();
    allUsersCombined.forEach((user: any) => {
        const id = `${user.tipoDocumentoIdentificacion}-${user.numDocumentoIdentificacion}`;
        if (id && id !== '-') {
            uniqueUserIdentifiers.add(id);
        }
    });
    setUniqueUserCount(uniqueUserIdentifiers.size);

    // 3. Process data by month
    const dataByMonth: ExecutionDataByMonth = new Map();
    
    filesByMonth.forEach((monthFiles, month) => {
        // Create a combined JSON object for the entire month
        const combinedJsonDataForMonth = {
            usuarios: monthFiles.flatMap(f => f.jsonData?.usuarios || [])
        };

        const monthCupCounts = calculateCupCounts(combinedJsonDataForMonth);
        let monthTotalRealValue = 0;
        monthCupCounts.forEach(cupData => {
            monthTotalRealValue += cupData.totalValue;
        });

        const combinedSummary = calculateSummary(combinedJsonDataForMonth);
        combinedSummary.numFactura = monthFiles.length > 1 ? `Combinado (${monthFiles.length} archivos)` : (monthFiles.length > 0 ? monthFiles[0].fileName : 'N/A');

        dataByMonth.set(month, {
            cupCounts: monthCupCounts,
            summary: combinedSummary,
            totalRealValue: monthTotalRealValue,
            rawJsonData: combinedJsonDataForMonth // Use the correctly combined data
        });
    });

    setExecutionData(dataByMonth);

    // Check for duplicate NITs and set prestador code
    const allNits: string[] = [];
    files.forEach(file => {
        if (file.jsonData) {
            const nit = findValueByKeyCaseInsensitive(file.jsonData, 'numDocumentoIdObligado');
            if (nit) allNits.push(nit);
        }
    });
    const uniqueNits = new Set(allNits);
    setShowDuplicateAlert(allNits.length > uniqueNits.size);
    setJsonPrestadorCode(files.length > 0 ? getCodPrestadorFromJson(files[0].jsonData) : null);

}, [files, filesByMonth, setExecutionData, setJsonPrestadorCode, setUniqueUserCount]);


  const handleReset = () => {
    setFiles([]);
    setError(null);
    setShowDuplicateAlert(false);
    setExecutionData(new Map());
    setJsonPrestadorCode(null);
    setUniqueUserCount(0);
  };

  if (!isClient) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        <p>Cargando analizador...</p>
      </div>
    );
  }

  const isUploadDisabled = isLoadingProviders || !canUploadForCurrentMonth || !canSelectNewMonth;
  const anyFileLoaded = files.length > 0;

  const getMonthName = (monthNumber: string) => {
    const date = new Date();
    date.setMonth(parseInt(monthNumber) - 1);
    const name = date.toLocaleString('es-CO', { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <div className="w-full space-y-8 mt-4">
      <Card className="w-full shadow-lg">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Carga tus Archivos JSON</CardTitle>
              <CardDescription>
                Selecciona el mes y carga hasta 2 archivos JSON. Puedes añadir hasta 3 meses.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={!canSelectNewMonth}>
                <SelectTrigger className="w-[180px]">
                  <Calendar className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Seleccionar mes..." />
                </SelectTrigger>
                <SelectContent>
                  {[...Array(12).keys()].map(i => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{getMonthName(String(i + 1))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {anyFileLoaded && (
                <Button onClick={handleReset} variant="outline">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FileUpload
            onFileLoad={handleFileLoad}
            disabled={isUploadDisabled}
            loadedFileNames={filesByMonth.get(selectedMonth)?.map(f => f.fileName as string) || []}
            maxFiles={2}
          />
        </CardContent>
      </Card>

      {showDuplicateAlert && (
        <Alert variant="destructive" className="bg-yellow-50 border-yellow-400 text-yellow-800 [&>svg]:text-yellow-800">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Alerta de NIT Duplicado</AlertTitle>
          <AlertDescription>
            Has cargado múltiples archivos que pertenecen al mismo prestador (NIT). El análisis combinará los datos.
          </AlertDescription>
        </Alert>
      )}

      {anyFileLoaded && (
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-center">Resultados de Archivos Cargados</h3>
          {files.map((file, index) => file.jsonData && (
            <Card key={index} className="shadow-md">
              <Accordion type="single" collapsible>
                <AccordionItem value={`item-${index}`}>
                  <AccordionTrigger className="p-6">
                    <div className="flex flex-col items-start text-left">
                      <h4 className="text-lg font-bold text-foreground">
                        <Building className="inline-block mr-2 h-5 w-5 text-primary" />
                        {file.prestadorInfo ? file.prestadorInfo.PRESTADOR : `Prestador no encontrado para código ${getCodPrestadorFromJson(file.jsonData) || 'desconocido'}`}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        NIT: {file.prestadorInfo?.NIT || findValueByKeyCaseInsensitive(file.jsonData, 'numDocumentoIdObligado')} | Archivo: {file.fileName} | Mes: {getMonthName(file.month)}
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-6 pt-0">
                    <DataVisualizer data={file.jsonData} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

    