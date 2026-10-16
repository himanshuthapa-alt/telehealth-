import { EventEmitter } from 'node:events';

/**
 * Wakes long-poll requests when a consultation changes (new message, status, presence).
 * ponytail: in-process, so it only works with one API instance; swap for Postgres
 * LISTEN/NOTIFY or Redis pub/sub if the API ever runs more than one process.
 */
export function createNotifier() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0); // one listener per open long-poll

  return {
    notify(consultationId: string) {
      emitter.emit(consultationId);
    },
    /** Resolves when the consultation changes, or after `ms`. Respects `signal` (client went away). */
    wait(consultationId: string, ms: number, signal?: AbortSignal): Promise<void> {
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          emitter.off(consultationId, done);
          signal?.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        emitter.once(consultationId, done);
        signal?.addEventListener('abort', done);
      });
    },
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
