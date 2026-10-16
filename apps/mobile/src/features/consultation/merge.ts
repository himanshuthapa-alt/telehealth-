import type { ChatMessage } from '@telecare/shared';

/** A message the user typed that the server hasn't confirmed yet. */
export interface OutboxItem {
  clientMsgId: string;
  body: string;
  state: 'sending' | 'failed';
}

/** Adds newly received messages, keeping order by id and never showing one twice. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Outbox items the server has not confirmed yet (confirmed ones appear as real messages). */
export function unconfirmed(outbox: OutboxItem[], messages: ChatMessage[]): OutboxItem[] {
  const confirmed = new Set(messages.map((m) => m.clientMsgId).filter(Boolean));
  return outbox.filter((o) => !confirmed.has(o.clientMsgId));
}
