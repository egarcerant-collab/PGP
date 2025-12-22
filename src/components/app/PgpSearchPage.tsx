

"use client";

import { forwardRef, useImperativeHandle, useRef } from 'react';
import PgPsearchForm from '@/components/pgp-search/PgPsearchForm';
import { ExecutionDataByMonth } from '@/app/page';
import { SavedAuditData } from './JsonAnalyzerPage';


interface PgpSearchPageProps {
  executionDataByMonth: ExecutionDataByMonth;
  jsonPrestadorCode: string | null;
  uniqueUserCount: number;
  initialAuditData: SavedAuditData | null;
}

interface PgpSearchPageHandle {
  handleSelectPrestador: (prestador: { PRESTADOR: string; WEB: string }) => void;
}

const PgpSearchPageComponent = forwardRef<PgpSearchPageHandle, PgpSearchPageProps>(
  ({ executionDataByMonth, jsonPrestadorCode, uniqueUserCount, initialAuditData }, ref) => {
    
    // Create a ref for the child component PgPsearchForm
    const pgpFormRef = useRef<{ handleSelectPrestador: (prestador: any) => void }>(null);

    // Expose the child's handleSelectPrestador function through this component's ref
    useImperativeHandle(ref, () => ({
      handleSelectPrestador: (prestador: { PRESTADOR: string; WEB: string }) => {
        if (pgpFormRef.current) {
          pgpFormRef.current.handleSelectPrestador(prestador);
        }
      },
    }));

    return (
      <div className="w-full space-y-8 mt-4">
        <PgPsearchForm 
          ref={pgpFormRef}
          executionDataByMonth={executionDataByMonth}
          jsonPrestadorCode={jsonPrestadorCode} 
          uniqueUserCount={uniqueUserCount}
          initialAuditData={initialAuditData}
        />
      </div>
    );
  }
);

PgpSearchPageComponent.displayName = 'PgpSearchPage';

export default PgpSearchPageComponent;
