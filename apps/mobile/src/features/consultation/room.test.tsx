import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { Appointment, Consultation, ConsultationUpdates, JoinResponse, Role } from '@telecare/shared';
import ConsultationRoom from '@/app/consultation/[appointmentId]';
import { ApiError } from '@/lib/api-client';

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouter.back(),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    push: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({ appointmentId: 'ap1' }),
}));
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `msg-${++mockUuid}` }));

let mockRole: Role = 'PATIENT';
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  useSession: () => ({
    status: 'signedIn',
    user: { id: mockRole === 'DOCTOR' ? 'doc1' : 'pat1', phone: '', fullName: 'Me', role: mockRole },
  }),
}));

const APPOINTMENT: Appointment = {
  id: 'ap1',
  status: 'BOOKED',
  startAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  endAt: new Date(Date.now() + 35 * 60_000).toISOString(),
  reasonNote: null,
  doctor: { id: 'doc1', name: 'Dr. Meera Iyer', specializations: ['Pediatrics'] },
  patient: { id: 'pat1', name: 'Asha Devi', age: 34 },
  cancelledBy: null,
  cancelReason: null,
  createdAt: new Date().toISOString(),
  consultationId: null,
};
const consultation = (extra: Partial<Consultation> = {}): Consultation => ({
  id: 'c1',
  appointmentId: 'ap1',
  status: 'WAITING',
  startedAt: null,
  endedAt: null,
  present: { patient: true, doctor: false },
  ...extra,
});

/** First long poll returns `first`; later ones wait until the screen closes (like a real long poll). */
function serveUpdates(first: Partial<ConsultationUpdates> = {}) {
  let served = false;
  mockGet.mockImplementation((path: string, opts?: { signal?: AbortSignal }) => {
    if (path === '/v1/appointments/ap1') return Promise.resolve(APPOINTMENT);
    if (!served) {
      served = true;
      return Promise.resolve({ consultation: consultation(), messages: [], cursor: 0, ...first });
    }
    return new Promise((_resolve, reject) =>
      opts?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
    );
  });
}

let client: QueryClient;
const renderRoom = (ui: ReactElement = <ConsultationRoom />) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
afterEach(() => client?.clear());
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'PATIENT';
  mockGet.mockReset();
  mockPost.mockReset();
});

const joined = (extra: Partial<Consultation> = {}): JoinResponse => ({
  consultation: consultation(extra),
  video: null,
  cursor: 0,
});

describe('consultation room', () => {
  it('patient: waiting room says who is here, in words', async () => {
    mockPost.mockResolvedValue(joined());
    serveUpdates();
    await renderRoom();
    expect(await screen.findByText('Waiting for the doctor to start')).toBeOnTheScreen();
    expect(screen.getByText('Doctor: not here yet')).toBeOnTheScreen();
    expect(screen.getByText('Patient: in the room')).toBeOnTheScreen();
    expect(mockPost).toHaveBeenCalledWith('/v1/appointments/ap1/join');
  });

  it('doctor: sees the patient waiting and can start', async () => {
    mockRole = 'DOCTOR';
    mockPost.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/start')
          ? consultation({ status: 'ACTIVE' })
          : joined({ present: { patient: true, doctor: true } }),
      ),
    );
    serveUpdates({ consultation: consultation({ present: { patient: true, doctor: true } }) });
    await renderRoom();
    expect(await screen.findByText('Your patient is waiting. Start when ready.')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Start consultation' }));
    expect(mockPost).toHaveBeenCalledWith('/v1/consultations/c1/start');
    expect(await screen.findByText('Consultation in progress')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'End consultation' })).toBeOnTheScreen();
  });

  it('a failed message can be retried, with the SAME id so the server never saves it twice', async () => {
    let sends = 0;
    mockPost.mockImplementation((path: string, body?: { clientMsgId: string; body: string }) => {
      if (path.endsWith('/join')) return Promise.resolve(joined({ status: 'ACTIVE' }));
      if (path.endsWith('/messages')) {
        sends += 1;
        if (sends === 1) return Promise.reject(new ApiError({ kind: 'offline' }));
        return Promise.resolve({
          id: 7,
          type: 'TEXT',
          senderId: 'pat1',
          clientMsgId: body!.clientMsgId,
          body: body!.body,
          createdAt: new Date().toISOString(),
        });
      }
      return Promise.resolve();
    });
    serveUpdates({ consultation: consultation({ status: 'ACTIVE' }) });
    await renderRoom();

    await userEvent.type(await screen.findByLabelText('Type a message'), 'I have a fever');
    await userEvent.press(screen.getByRole('button', { name: 'Send' }));
    const failed = await screen.findByRole('button', { name: /Not sent\. Tap to try again/ });
    await userEvent.press(failed);

    await waitFor(() => expect(screen.queryByText(/Not sent/)).toBeNull());
    expect(screen.getByText('I have a fever')).toBeOnTheScreen();
    const ids = mockPost.mock.calls
      .filter((c) => (c[0] as string).endsWith('/messages'))
      .map((c) => (c[1] as { clientMsgId: string }).clientMsgId);
    expect(ids).toEqual(['msg-1', 'msg-1']);
  });

  it('before the window: explains when the room opens, with a way to try again', async () => {
    mockPost.mockRejectedValue(new ApiError({ kind: 'http', status: 409, code: 'JOIN_NOT_OPEN' }));
    mockGet.mockResolvedValue(APPOINTMENT);
    await renderRoom();
    expect(await screen.findByText(/The room opens at .*, 10 minutes before your time\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('after the end: no message box, one clear way back', async () => {
    mockPost.mockResolvedValue(joined({ status: 'ACTIVE' }));
    serveUpdates({ consultation: consultation({ status: 'COMPLETED' }) });
    await renderRoom();
    expect(await screen.findByText('This consultation has ended')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Type a message')).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Back to my bookings' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
