import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { PatientProfile } from '@telecare/shared';
import Appointments from '@/app/patient/appointments';
import Doctors from '@/app/patient/doctors';
import Home from '@/app/patient/home';
import Medicines from '@/app/patient/medicines';
import Profile from '@/app/patient/profile';
import { ApiError } from '@/lib/api-client';

const mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: {
    navigate: (...a: unknown[]) => mockNavigate(...a),
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
  useLocalSearchParams: () => mockParams,
}));

let mockOnline = true;
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: mockOnline, isInternetReachable: mockOnline }),
}));

const mockGet = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { get: (path: string) => mockGet(path) },
  session: { logout: jest.fn(), updateUser: jest.fn() },
  useSession: () => ({
    status: 'signedIn',
    user: { id: 'u1', phone: '+919000000001', fullName: 'Asha Devi', role: 'PATIENT' },
  }),
}));

const PROFILE: PatientProfile = {
  fullName: 'Asha Devi',
  phone: '+919000000001',
  dateOfBirth: null,
  gender: null,
  preferredLanguage: null,
  district: null,
  consentAt: '2026-09-30T10:00:00.000Z',
};

/** Renders a screen and waits until its data requests have settled. */
async function renderScreen(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const result = await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  // Wait until every query the screen started has finished (screens without queries settle at once).
  await waitFor(() =>
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((q) => q.state.status !== 'pending' && q.state.fetchStatus === 'idle'),
    ).toBe(true),
  );
  // TanStack hands results to React on a 0 ms timer; let it fire inside act().
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return result;
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockGet
    .mockReset()
    .mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/v1/doctors')
          ? { items: [], page: 1, pageSize: 20, total: 0 }
          : path.startsWith('/v1/appointments') || path.startsWith('/v1/prescriptions')
            ? []
            : PROFILE,
      ),
    );
  mockParams = {};
  mockOnline = true;
});

describe('patient tabs', () => {
  it('Home: greets, offers doctor search and specialties, explains the 3 steps, suggests adding details', async () => {
    await renderScreen(<Home />);
    expect(screen.getByText('Namaste, Asha')).toBeOnTheScreen();
    expect(screen.getByText('How it works')).toBeOnTheScreen();
    expect(await screen.findByText('Help your doctor prepare')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Child doctor, Pediatrics' }));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/patient/doctors',
      params: { specialization: 'Pediatrics' },
    });
  });

  it('Home: hides the details card once a detail is filled in', async () => {
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith('/v1/appointments') ? [] : { ...PROFILE, preferredLanguage: 'Hindi' }),
    );
    await renderScreen(<Home />);
    await screen.findByText('How it works');
    expect(screen.queryByText('Help your doctor prepare')).toBeNull();
  });

  it('Appointments: empty Upcoming leads to doctor search; Past has its own empty state', async () => {
    await renderScreen(<Appointments />);
    expect(await screen.findByText('No bookings yet.')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Find a doctor' }));
    expect(mockNavigate).toHaveBeenCalledWith('/patient/doctors');

    await userEvent.press(screen.getByRole('tab', { name: 'Past' }));
    expect(await screen.findByText('No past bookings.')).toBeOnTheScreen();
  });

  it('Medicines: each of the four segments has an empty state', async () => {
    await renderScreen(<Medicines />);
    expect(screen.getByText('No prescriptions yet.')).toBeOnTheScreen();
    for (const [tab, text] of [
      ['Catalog', 'The medicine catalog opens soon.'],
      ['Cart', 'Your cart is empty.'],
      ['Orders', 'No orders yet.'],
    ] as const) {
      await userEvent.press(screen.getByRole('tab', { name: tab }));
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  });

  it('Profile: shows details, with "Not added" for empty optional fields', async () => {
    await renderScreen(<Profile />);
    expect(await screen.findByLabelText('Mobile: +919000000001')).toBeOnTheScreen();
    expect(screen.getByLabelText('Language: not added')).toBeOnTheScreen();
  });

  it('Profile: shows a plain error and recovers with Try again', async () => {
    mockGet.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 503, code: 'SERVICE_UNAVAILABLE' }));
    await renderScreen(<Profile />);
    expect(await screen.findByText(/having trouble/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Mobile: +919000000001')).toBeOnTheScreen();
  });

  it.each([
    ['Home', Home],
    ['Doctors', Doctors],
    ['Appointments', Appointments],
    ['Medicines', Medicines],
    ['Profile', Profile],
  ])('%s shows the offline banner when the connection drops', async (_name, Tab) => {
    mockOnline = false;
    await renderScreen(<Tab />);
    expect(await screen.findByText("You're offline. Showing saved information.")).toBeOnTheScreen();
  });
});
