'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { researchHeaders } from '@/lib/research-client';

export default function ResearchSessionControls() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch('/api/research/auth/logout', {
        method: 'POST',
        headers: researchHeaders(),
      });
    } finally {
      router.refresh();
      setPending(false);
    }
  }

  return (
    <div className="research-session-controls">
      <span>Private session</span>
      <button type="button" onClick={logout} disabled={pending}>
        <LogOut size={15} />
        {pending ? 'Closing…' : 'Log out'}
      </button>
    </div>
  );
}
