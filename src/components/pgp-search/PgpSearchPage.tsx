

import PgPsearchForm from '@/components/pgp-search/PgPsearchForm';
import { ExecutionDataByMonth } from '@/app/page';

interface PgpSearchPageProps {
  executionDataByMonth: ExecutionDataByMonth;
  jsonPrestadorCode: string | null;
  uniqueUserCount: number;
}

export default function PgpSearchPage({ executionDataByMonth, jsonPrestadorCode, uniqueUserCount }: PgpSearchPageProps) {
  return (
    <div className="w-full space-y-8 mt-4">
      <PgPsearchForm 
        executionDataByMonth={executionDataByMonth}
        jsonPrestadorCode={jsonPrestadorCode} 
        uniqueUserCount={uniqueUserCount}
        initialAuditData={null}
      />
    </div>
  );
}

    