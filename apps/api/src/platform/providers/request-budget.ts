/**
 * A process-local cap for third-party API requests. It counts calls rather
 * than estimating dollars because provider prices and request sizes vary.
 */
export function createRequestBudget(options: {
  dailyLimit: number;
  warningRatio: number;
  onWarning?: (usage: { used: number; limit: number; ratio: number }) => void;
  now?: () => Date;
}) {
  let day = '';
  let used = 0;
  let warned = false;
  const now = options.now ?? (() => new Date());

  return {
    reserve(): boolean {
      const currentDay = now().toISOString().slice(0, 10);
      if (day !== currentDay) {
        day = currentDay;
        used = 0;
        warned = false;
      }
      if (used >= options.dailyLimit) return false;
      used += 1;
      const ratio = used / options.dailyLimit;
      if (!warned && ratio >= options.warningRatio) {
        warned = true;
        options.onWarning?.({ used, limit: options.dailyLimit, ratio });
      }
      return true;
    },
    snapshot() {
      return { day, used, limit: options.dailyLimit };
    },
  };
}

export type RequestBudget = ReturnType<typeof createRequestBudget>;
