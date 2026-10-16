type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export type Logger = Record<Level, (msg: string, fields?: Record<string, unknown>) => void>;

/**
 * Structured JSON-lines logger.
 * Never pass request bodies, message text, prescription contents, passwords
 * or tokens as fields: logs must not contain health data or secrets.
 */
export function createLogger(minLevel: Level | 'silent' = 'info'): Logger {
  const log = (level: Level) => (msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  };
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}
