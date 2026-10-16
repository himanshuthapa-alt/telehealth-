import { useEffect, useState } from 'react';

/** The current time, refreshed every `ms`, so time-based buttons (like Join) appear on their own. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
