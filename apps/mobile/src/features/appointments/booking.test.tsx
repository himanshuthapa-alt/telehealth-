import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { Appointment, Availability, SlotsResponse } from '@telecare/shared';
import DoctorAvailability from '@/app/doctor/availability';
import DoctorToday from '@/app/doctor/today';
import Review from '@/app/patient/doctors/review';
import Slots from '@/app/patient/doctors/slots';
import { ApiError } from '@/lib/api-client';
import { AppointmentDetail } from './AppointmentDetail';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() };
let mockParams: Record<string, string> = {};
// Jest creates this mock before `mockRouter` exists, so look it up lazily on each call.
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    navigate: (...a: unknown[]) => mockRouter.navigate(...a),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
  addNetworkStateListener: jest.fn(),
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockUuid}` }));
jest.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: () => null }));

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    get: (path: string) => mockGet(path),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
    delete: jest.fn(),
  },
  session: { subscribe: jest.fn(), getState: jest.fn() },
  useSession: () => ({
    status: 'signedIn',
    user: { id: 'doc1', phone: '', fullName: 'Dr. Demo', role: 'DOCTOR' },
  }),
}));

const DOCTOR = {
  id: 'doc1',
  name: 'Dr. Meera Iyer (demo)',
  specializations: ['Pediatrics'],
  languages: ['Hindi'],
  experienceYears: 9,
  feeInr: 400,
  ratingAvg: 4.8,
  ratingCount: 10,
  photoUrl: null,
  isDemo: true,
  bio: '',
};
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const appointment = (startAt: string, extra: Partial<Appointment> = {}): Appointment => ({
  id: 'ap1',
  status: 'BOOKED',
  startAt,
  endAt: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(),
  reasonNote: 'Fever for 3 days',
  doctor: { id: 'doc1', name: DOCTOR.name, specializations: ['Pediatrics'] },
  patient: { id: 'pat1', name: 'Asha Devi', age: 34 },
  cancelledBy: null,
  cancelReason: null,
  createdAt: new Date().toISOString(),
  consultationId: null,
  ...extra,
});

let client: QueryClient;
async function renderScreen(ui: ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
afterEach(() => client?.clear());
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockGet.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
});

describe('slot picker', () => {
  const slots: SlotsResponse = {
    doctorId: 'doc1',
    days: [
      { date: '2030-01-07', slots: [] },
      {
        date: '2030-01-08',
        slots: [
          { startAt: '2030-01-08T04:30:00.000Z', endAt: '2030-01-08T05:00:00.000Z' },
          { startAt: '2030-01-08T05:00:00.000Z', endAt: '2030-01-08T05:30:00.000Z' },
        ],
      },
    ],
  };

  it('opens on the first day with free times and continues with the chosen time', async () => {
    mockParams = { doctorId: 'doc1' };
    mockGet.mockImplementation((path: string) => Promise.resolve(path.includes('/slots') ? slots : DOCTOR));
    await renderScreen(<Slots />);
    expect(await screen.findByRole('button', { name: '10:00 AM' })).toBeOnTheScreen(); // 04:30 UTC = 10:00 IST
    expect(screen.getByRole('button', { name: 'Choose a time first' })).toBeDisabled();

    await userEvent.press(screen.getByRole('button', { name: '10:30 AM' }));
    await userEvent.press(screen.getByRole('button', { name: /^Continue:/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/patient/doctors/review',
      params: { doctorId: 'doc1', startAt: '2030-01-08T05:00:00.000Z', endAt: '2030-01-08T05:30:00.000Z' },
    });
  });

  it('says so when the doctor has no free times', async () => {
    mockParams = { doctorId: 'doc1' };
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes('/slots') ? { doctorId: 'doc1', days: [{ date: '2030-01-07', slots: [] }] } : DOCTOR,
      ),
    );
    await renderScreen(<Slots />);
    expect(await screen.findByText('No free times in the next 14 days.')).toBeOnTheScreen();
  });
});

describe('booking review', () => {
  beforeEach(() => {
    mockParams = { doctorId: 'doc1', startAt: '2030-01-08T04:30:00.000Z', endAt: '2030-01-08T05:00:00.000Z' };
    mockGet.mockResolvedValue(DOCTOR);
  });

  it('sends the booking with an idempotency key, and a retry reuses the SAME key', async () => {
    mockPost
      .mockRejectedValueOnce(new ApiError({ kind: 'timeout' }))
      .mockResolvedValueOnce(appointment('2030-01-08T04:30:00.000Z'));
    await renderScreen(<Review />);
    await screen.findByText('Dr. Meera Iyer (demo)');
    await userEvent.type(screen.getByLabelText('Reason for visit (optional)'), 'Fever');

    await userEvent.press(screen.getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText(/taking too long/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/patient/doctors/booked',
        params: { id: 'ap1' },
      }),
    );
    expect(mockPost).toHaveBeenCalledTimes(2);
    const [first, second] = mockPost.mock.calls;
    expect(first![1]).toEqual({ doctorId: 'doc1', startAt: '2030-01-08T04:30:00.000Z', reasonNote: 'Fever' });
    expect(first![2]).toEqual({ 'Idempotency-Key': 'key-1' });
    expect(second![2]).toEqual(first![2]); // same key: the server returns the same booking, never a second one
  });

  it('when someone else took the time, offers to pick another', async () => {
    mockPost.mockRejectedValue(new ApiError({ kind: 'http', status: 409, code: 'SLOT_TAKEN' }));
    await renderScreen(<Review />);
    await userEvent.press(await screen.findByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText(/just booked by someone else/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Pick another time' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('appointment detail', () => {
  it('a patient can cancel more than 2 hours ahead', async () => {
    const start = hoursFromNow(5);
    const cancelled = appointment(start, { status: 'CANCELLED', cancelledBy: 'PATIENT' });
    mockGet.mockResolvedValue(appointment(start));
    mockPost.mockImplementation(async () => {
      mockGet.mockResolvedValue(cancelled); // the server now has it cancelled; the app refetches
      return cancelled;
    });
    await renderScreen(<AppointmentDetail id="ap1" viewer="PATIENT" />);
    await userEvent.press(await screen.findByRole('button', { name: 'Cancel appointment' }));
    await userEvent.press(screen.getByRole('button', { name: 'Yes, cancel it' }));
    expect(mockPost).toHaveBeenCalledWith('/v1/appointments/ap1/cancel', {});
    expect(await screen.findByText('Cancelled')).toBeOnTheScreen();
  });

  it('a patient inside the 2-hour cutoff sees why they cannot cancel', async () => {
    mockGet.mockResolvedValue(appointment(hoursFromNow(1)));
    await renderScreen(<AppointmentDetail id="ap1" viewer="PATIENT" />);
    expect(await screen.findByText(/up to 2 hours before the start/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel appointment' })).toBeNull();
  });

  it('a doctor sees patient basics and must give a reason to cancel', async () => {
    mockGet.mockResolvedValue(appointment(hoursFromNow(1)));
    mockPost.mockResolvedValue(appointment(hoursFromNow(1), { status: 'CANCELLED' }));
    await renderScreen(<AppointmentDetail id="ap1" viewer="DOCTOR" />);
    expect(await screen.findByLabelText('Age: 34 years')).toBeOnTheScreen();
    expect(screen.getByLabelText('Reason: Fever for 3 days')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(screen.getByRole('button', { name: 'Yes, cancel it' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason for the patient'), 'Emergency');
    await userEvent.press(screen.getByRole('button', { name: 'Yes, cancel it' }));
    expect(mockPost).toHaveBeenCalledWith('/v1/appointments/ap1/cancel', { reason: 'Emergency' });
  });
});

const STATS = { today: 1, upcoming: 2, completed: 3, earningsInr: 900 };
/** Today also loads the stats row; answer that path separately. */
const todayReturns = (list: unknown[]) =>
  mockGet.mockImplementation((path: string) =>
    Promise.resolve(path === '/v1/me/doctor-stats' ? STATS : list),
  );

describe('doctor screens', () => {
  it("Today lists today's patients with their basics", async () => {
    todayReturns([appointment(hoursFromNow(1))]);
    await renderScreen(<DoctorToday />);
    expect(await screen.findByText('Asha Devi')).toBeOnTheScreen();
    expect(screen.getByText('34 years · Fever for 3 days')).toBeOnTheScreen();
    expect(mockGet).toHaveBeenCalledWith('/v1/appointments?scope=today');
  });

  it('Today shows an empty state that points to Availability', async () => {
    todayReturns([]);
    await renderScreen(<DoctorToday />);
    expect(await screen.findByText('No consultations today.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Earned: ₹900')).toBeOnTheScreen();
  });

  it('Availability saves the chosen blocks and consultation length as weekly rules', async () => {
    const empty: Availability = { rules: [], exceptions: [] };
    mockGet.mockResolvedValue(empty);
    mockPut.mockResolvedValue(empty);
    await renderScreen(<DoctorAvailability />);
    await userEvent.press(await screen.findByRole('checkbox', { name: 'Mon Morning' }));
    await userEvent.press(screen.getByRole('checkbox', { name: 'Sat Evening' }));
    await userEvent.press(screen.getByRole('button', { name: '20 min' }));
    await userEvent.press(screen.getByRole('button', { name: 'Save hours' }));
    expect(mockPut).toHaveBeenCalledWith('/v1/availability/rules', {
      rules: [
        { weekday: 1, startTime: '09:00', endTime: '13:00', slotMinutes: 20 },
        { weekday: 6, startTime: '17:00', endTime: '20:00', slotMinutes: 20 },
      ],
    });
    expect(await screen.findByText(/Hours saved/)).toBeOnTheScreen();
  });
});
