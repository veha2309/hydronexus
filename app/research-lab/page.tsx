import { connection } from 'next/server';
import Workspace from '@/components/workspace';
import ResearchAccess from '@/components/research-access';
import ResearchSessionControls from '@/components/research-session-controls';
import { isResearchAuthenticated } from '@/lib/research-auth';

export default async function ResearchLabPage() {
  await connection();
  if (!(await isResearchAuthenticated())) return <ResearchAccess />;
  return (
    <div className="research-shell">
      <ResearchSessionControls />
      <Workspace />
    </div>
  );
}
