import type { ChatMessage } from '@telecare/shared';
import { mergeMessages, unconfirmed } from './merge';

const msg = (id: number, clientMsgId: string | null = null): ChatMessage => ({
  id,
  type: 'TEXT',
  senderId: 'u',
  clientMsgId,
  body: `m${id}`,
  createdAt: '2030-01-01T00:00:00Z',
});

describe('chat merging', () => {
  it('keeps messages in order and drops duplicates (a message can arrive by send reply and by poll)', () => {
    expect(mergeMessages([msg(1), msg(3)], [msg(2), msg(3)]).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('removes outbox items once the server has the message', () => {
    const outbox = [
      { clientMsgId: 'a', body: 'x', state: 'sending' as const },
      { clientMsgId: 'b', body: 'y', state: 'failed' as const },
    ];
    expect(unconfirmed(outbox, [msg(1, 'a')]).map((o) => o.clientMsgId)).toEqual(['b']);
  });
});
