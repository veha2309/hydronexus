import { VARIABLES } from '@/lib/ocean';
export async function GET() {
  return Response.json({
    source: 'HydroNexus synthetic demonstration',
    variables: VARIABLES,
  });
}
