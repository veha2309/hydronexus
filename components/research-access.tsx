'use client';

import { useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LoaderCircle, LockKeyhole, Waves } from 'lucide-react';

export default function ResearchAccess() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/research/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Access could not be verified.');
      setPassword('');
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Access could not be verified.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="research-access">
      <section className="research-access-card" aria-labelledby="access-title">
        <div className="research-access-brand" aria-hidden="true">
          <Waves size={30} />
          <span>HydroNexus</span>
        </div>
        <div className="research-lock" aria-hidden="true">
          <LockKeyhole size={25} />
        </div>
        <p className="eyebrow">Restricted workspace</p>
        <h1 id="access-title">Research Lab</h1>
        <p>
          This workspace contains experimental analysis and private processing
          tools. Enter the owner password to continue.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="research-password">Password</label>
          <div className="research-password-field">
            <KeyRound size={18} aria-hidden="true" />
            <input
              id="research-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={256}
              required
            />
          </div>
          {error && <p className="research-access-error">{error}</p>}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? <LoaderCircle className="spin" size={17} /> : null}
            {pending ? 'Verifying…' : 'Enter Research Lab'}
          </button>
        </form>
        <small>
          Access expires when the browser session ends and no later than 24
          hours after sign-in.
        </small>
      </section>
    </main>
  );
}
