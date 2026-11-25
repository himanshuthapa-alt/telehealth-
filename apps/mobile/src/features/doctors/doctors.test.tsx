import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { DoctorCard, Page } from '@telecare/shared';
import DoctorProfile from '@/app/patient/doctors/[id]';
import Doctors from '@/app/patient/doctors';
import { ApiError } from '@/lib/api-client';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), canGoBack: () => false },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
  addNetworkStateListener: jest.fn(),
}));
const mockGet = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { get: (path: string) => mockGet(path) },
  session: { subscribe: jest.fn(), getState: jest.fn() },
}));

const doctor = (id: string, name: string, extra: Partial<DoctorCard> = {}): DoctorCard => ({
  id,
  name,
  specializations: ['Pediatrics'],
  languages: ['Hindi', 'English'],
  experienceYears: 9,
  feeInr: 400,
  ratingAvg: 4.8,
  ratingCount: 158,
  photoUrl: null,
  isDemo: true,
  source: 'local',
  ...extra,
});
const page = (items: DoctorCard[], total = items.length, n = 1): Page<DoctorCard> => ({
  items,
  page: n,
  pageSize: 20,
  total,
});
const MEERA = doctor('d1', 'Dr. Meera Iyer (demo)');
const ANIL = doctor('d2', 'Dr. Anil Kumar (demo)', {
  specializations: ['Cardiology'],
  ratingAvg: null,
  ratingCount: 0,
});

/** Query string of the last /v1/doctors request, as an object. */
const lastSearch = () => {
  const path = mockGet.mock.calls
    .map((c) => c[0] as string)
    .filter((p) => p.startsWith('/v1/doctors?'))
    .at(-1)!;
  return Object.fromEntries(new URLSearchParams(path.split('?')[1]));
};

let client: QueryClient;
/** At least one query has started and none is still loading (isFetching() alone is 0 before the first fetch begins). */
const settled = (c: QueryClient) => {
  const queries = c.getQueryCache().getAll();
  return (
    queries.length > 0 && queries.every((q) => q.state.status !== 'pending' && q.state.fetchStatus === 'idle')
  );
};
async function renderScreen(ui: ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const result = await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  await waitFor(() => expect(settled(client)).toBe(true));
  // TanStack hands results to React on a 0 ms timer; let it fire inside act().
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return result;
}

// Doctor queries keep a 7-day cache timer; clearing the client stops Jest from waiting on it.
afterEach(() => client?.clear());

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(page([MEERA, ANIL]));
  mockPush.mockReset();
  mockParams = {};
  onlineManager.setOnline(true);
});

describe('Find a doctor', () => {
  it('lists doctors with fee, rating (or "New") and a Demo label', async () => {
    await renderScreen(<Doctors />);
    expect(await screen.findByText('Dr. Meera Iyer (demo)')).toBeOnTheScreen();
    expect(screen.getByText('4.8 ★ (158)')).toBeOnTheScreen();
    expect(screen.getByText('New')).toBeOnTheScreen();
    expect(screen.getAllByText('Demo')).toHaveLength(2);
    expect(screen.getByText('2 doctors')).toBeOnTheScreen();
    expect(lastSearch()).toEqual({ sort: 'rating', page: '1' });
  });

  it('starts filtered by the specialty tapped on Home', async () => {
    mockParams = { specialization: 'Pediatrics' };
    await renderScreen(<Doctors />);
    expect(lastSearch()).toMatchObject({ specialization: 'Pediatrics' });
  });

  it('combines specialty, language, rating and sort in one request', async () => {
    await renderScreen(<Doctors />);
    await userEvent.press(screen.getByRole('button', { name: 'Skin & hair' }));
    await userEvent.press(screen.getByRole('button', { name: 'More filters' }));
    await userEvent.press(screen.getByRole('button', { name: 'Tamil' }));
    await userEvent.press(screen.getByRole('button', { name: '4+ ★' }));
    await userEvent.press(screen.getByRole('button', { name: 'Lowest fee' }));
    await waitFor(() =>
      expect(lastSearch()).toEqual({
        specialization: 'Dermatology',
        language: 'Tamil',
        minRating: '4',
        sort: 'fee',
        page: '1',
      }),
    );
    expect(screen.getByRole('button', { name: 'Hide filters' })).toBeOnTheScreen();
  });

  it('searches by typed text after the user pauses', async () => {
    await renderScreen(<Doctors />);
    await userEvent.type(screen.getByLabelText('Search doctors'), 'iyer');
    await waitFor(() => expect(lastSearch()).toMatchObject({ q: 'iyer' }), { timeout: 2000 });
  });

  it('shows an empty state that clears the filters', async () => {
    mockParams = { specialization: 'Psychiatry' };
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(path.includes('specialization') ? page([]) : page([MEERA])),
    );
    await renderScreen(<Doctors />);
    expect(await screen.findByText('No doctors match.')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Dr. Meera Iyer (demo)')).toBeOnTheScreen();
  });

  it('shows the error and retries', async () => {
    mockGet.mockRejectedValueOnce(new ApiError({ kind: 'timeout' }));
    await renderScreen(<Doctors />);
    expect(await screen.findByText(/taking too long/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dr. Meera Iyer (demo)')).toBeOnTheScreen();
  });

  it('loads the next page when scrolled to the end', async () => {
    const first = Array.from({ length: 20 }, (_, i) => doctor(`p${i}`, `Dr. Page One ${i}`));
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes('page=2') ? page([doctor('last', 'Dr. Last One')], 21, 2) : page(first, 21),
      ),
    );
    await renderScreen(<Doctors />);
    await screen.findByText('Dr. Page One 0');
    // Scrolling isn't simulated in tests; fire the list's end-reached event directly.
    fireEvent(screen.getByTestId('doctor-list'), 'onEndReached');
    await waitFor(() => expect(lastSearch()).toMatchObject({ page: '2' }));
  });

  it('opens a doctor when the card is tapped', async () => {
    await renderScreen(<Doctors />);
    await userEvent.press(await screen.findByRole('button', { name: /^Dr\. Meera Iyer/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/patient/doctors/[id]', params: { id: 'd1' } });
  });
});

describe('Doctor profile', () => {
  it('shows the full profile with bio, and opens the slot picker', async () => {
    mockParams = { id: 'd1' };
    mockGet.mockResolvedValue({ ...MEERA, bio: 'Child health and vaccinations.' });
    await renderScreen(<DoctorProfile />);
    expect(await screen.findByText('Child health and vaccinations.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Consultation fee: ₹400')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Book a consultation' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/patient/doctors/slots', params: { doctorId: 'd1' } });
  });

  it('offline, shows the doctor from the saved search results instead of a blank screen', async () => {
    mockParams = { id: 'd1' };
    await renderScreen(<Doctors />); // fills the search cache
    onlineManager.setOnline(false);
    const { unmount } = await render(
      <QueryClientProvider client={client}>
        <DoctorProfile />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Dr. Meera Iyer (demo)')).toBeOnTheScreen();
    expect(screen.getByText('Speaks Hindi, English')).toBeOnTheScreen();
    unmount();
  });

  it('says "not found" for a doctor who no longer exists', async () => {
    mockParams = { id: 'gone' };
    mockGet.mockRejectedValue(new ApiError({ kind: 'http', status: 404, code: 'NOT_FOUND' }));
    await renderScreen(<DoctorProfile />);
    expect(await screen.findByText("We couldn't find this.")).toBeOnTheScreen();
  });
});
