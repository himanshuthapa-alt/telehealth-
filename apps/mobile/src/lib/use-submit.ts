import { useState } from 'react';
import { errorMessage, fieldErrors } from './errors';

/** Busy/error state for a form submit. Ignores taps while a submit is running. */
export function useSubmit<A extends unknown[]>(action: (...args: A) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(...args: A) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action(...args);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return { submit, busy, message: error ? errorMessage(error) : null, fields: fieldErrors(error) };
}
