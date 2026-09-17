import { authorizeResearchRequest } from '@/lib/research-auth';
import { PUBLIC_SIGNALS } from '@/lib/hazards';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await authorizeResearchRequest(request);
  if (denied) return denied;
  return Response.json(
    {
      signals: PUBLIC_SIGNALS,
      detectors: [
        'eddy-rotation',
        'extreme-wave-exposure',
        'strong-current-corridor',
        'sst-anomaly',
        'possible-bloom',
        'model-observation-disagreement',
        'data-quality',
      ],
      status: 'detector-implementation-pending',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
