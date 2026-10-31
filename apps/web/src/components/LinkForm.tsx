'use client';

import { useActionState } from 'react';
import { linkDevice, type LinkState } from '@/app/actions/devices';

export function LinkForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(linkDevice, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="code" className="label">
          Code affiché sur la TV
        </label>
        <input
          id="code"
          name="code"
          required
          defaultValue={defaultCode}
          maxLength={7}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABC234"
          className="input font-mono text-2xl tracking-[0.3em] uppercase"
        />
      </div>
      <div>
        <label htmlFor="name" className="label">
          Nom de la TV
        </label>
        <input id="name" name="name" maxLength={60} placeholder="TV salon" className="input" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? 'Liaison…' : 'Lier cette TV'}
      </button>
    </form>
  );
}
