import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { ApiError } from './api-client';
import { persistOptions, shouldPersistQuery, shouldRetry } from './query';

jest.mock('./api', () => ({ session: { subscribe: jest.fn(), getState: jest.fn() } }));
jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn() }));

const DOCTORS = { items: [{ id: 'd1', name: 'Dr Demo' }], page: 1, pageSize: 20, total: 1 };
const PROFILE = { fullName: 'Asha', dateOfBirth: '1990-04-12' };

describe('offline cache', () => {
  beforeEach(() => AsyncStorage.clear());

  it('saves only public directory data, then restores it in a fresh app start', async () => {
    const before = new QueryClient();
    before.setQueryData(['doctors', 'search', {}], DOCTORS);
    before.setQueryData(['me', 'profile'], PROFILE);
    await persistQueryClientSave({ queryClient: before, ...persistOptions });

    const saved = JSON.stringify(await AsyncStorage.getItem('telecare.publicCache'));
    expect(saved).toContain('Dr Demo');
    expect(saved).not.toContain('1990-04-12'); // health/personal data never touches disk

    const after = new QueryClient(); // app restarted, maybe offline
    await persistQueryClientRestore({ queryClient: after, ...persistOptions });
    expect(after.getQueryData(['doctors', 'search', {}])).toEqual(DOCTORS);
    expect(after.getQueryData(['me', 'profile'])).toBeUndefined();
  });

  it('does not save failed queries', () => {
    expect(shouldPersistQuery({ queryKey: ['doctors', 'search'], state: { status: 'error' } } as never)).toBe(
      false,
    );
    expect(
      shouldPersistQuery({ queryKey: ['doctors', 'search'], state: { status: 'success' } } as never),
    ).toBe(true);
  });
});

describe('shouldRetry', () => {
  it('retries network trouble and server errors twice, never client errors', () => {
    expect(shouldRetry(0, new ApiError({ kind: 'offline' }))).toBe(true);
    expect(shouldRetry(1, new ApiError({ kind: 'timeout' }))).toBe(true);
    expect(shouldRetry(2, new ApiError({ kind: 'timeout' }))).toBe(false);
    expect(shouldRetry(0, new ApiError({ kind: 'http', status: 503, code: 'SERVICE_UNAVAILABLE' }))).toBe(
      true,
    );
    expect(shouldRetry(0, new ApiError({ kind: 'http', status: 404, code: 'NOT_FOUND' }))).toBe(false);
    expect(shouldRetry(0, new Error('bug'))).toBe(false);
  });
});
