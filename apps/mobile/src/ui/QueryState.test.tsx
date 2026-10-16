import type { UseQueryResult } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ApiError } from '@/lib/api-client';
import { QueryState } from './QueryState';

jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn() } }));

/** Only the fields QueryState reads. */
function query<T>(fields: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    data: undefined,
    isPending: false,
    fetchStatus: 'idle',
    error: null,
    refetch: jest.fn(),
    ...fields,
  } as never;
}

const renderState = (q: UseQueryResult<string[]>) =>
  render(
    <QueryState query={q} isEmpty={(d) => d.length === 0} empty={<Text>Nothing here</Text>}>
      {(data) => <Text>{data.join(',')}</Text>}
    </QueryState>,
  );

describe('QueryState', () => {
  it('shows skeleton cards while loading', async () => {
    await renderState(query({ isPending: true, fetchStatus: 'fetching' }));
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });

  it('says it will load when back online if the first load is waiting for a connection', async () => {
    await renderState(query({ isPending: true, fetchStatus: 'paused' }));
    expect(screen.getByText("You're offline.")).toBeOnTheScreen();
  });

  it('shows the error in plain words with a working Try again button', async () => {
    const q = query<string[]>({ error: new ApiError({ kind: 'timeout' }) });
    await renderState(q);
    expect(screen.getByText(/taking too long/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(q.refetch).toHaveBeenCalled();
  });

  it('shows "not found" for 404 and 403, without a retry', async () => {
    await renderState(query({ error: new ApiError({ kind: 'http', status: 404, code: 'NOT_FOUND' }) }));
    expect(screen.getByText("We couldn't find this.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('shows the empty state for an empty list, and the content otherwise', async () => {
    await renderState(query({ data: [] }));
    expect(screen.getByText('Nothing here')).toBeOnTheScreen();
    await renderState(query({ data: ['a', 'b'] }));
    expect(screen.getByText('a,b')).toBeOnTheScreen();
  });

  it('keeps showing saved data when a refresh fails', async () => {
    await renderState(query({ data: ['saved'], error: new ApiError({ kind: 'offline' }) }));
    expect(screen.getByText('saved')).toBeOnTheScreen();
  });
});
