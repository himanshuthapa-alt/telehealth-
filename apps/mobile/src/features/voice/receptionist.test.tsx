import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { DoctorCard } from '@telecare/shared';
import { findOffer, offerKey, yesNo } from './receptionist';
import { ReceptionistModal } from './ReceptionistModal';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ router: { navigate: (...a: unknown[]) => mockNavigate(...a) } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1' }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
}));
const mockSpeak = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('./speech-api', () => ({ speak: (...a: unknown[]) => mockSpeak(...a) }));

const doctor = (id: string, name: string, languages: string[]): DoctorCard =>
  ({
    id,
    name,
    specializations: ['Pediatrics'],
    languages,
    experienceYears: 9,
    feeInr: 400,
    ratingAvg: 4.8,
    ratingCount: 10,
    photoUrl: null,
    isDemo: false,
    source: 'local',
  }) as DoctorCard;
const MEERA = doctor('d1', 'Dr. Meera Iyer', ['Hindi', 'English']);
const RAVI = doctor('d2', 'Dr. Ravi Rao', ['Hindi']);
const slots = (id: string, times: string[]) => ({
  doctorId: id,
  days: [{ date: '2030-01-07', slots: times.map((t) => ({ startAt: t, endAt: t })) }],
});
// Ravi is free earlier than Meera.
const T1 = '2030-01-07T04:30:00Z';
const T2 = '2030-01-07T05:00:00Z';
const T3 = '2030-01-07T06:00:00Z';
function directory(path: string) {
  if (path === '/v1/voice/capabilities') return Promise.resolve({ indianLanguages: false });
  if (path.startsWith('/v1/doctors?'))
    return Promise.resolve({ items: [MEERA, RAVI], total: 2, page: 1, pageSize: 20 });
  if (path.includes('/d1/slots')) return Promise.resolve(slots('d1', [T2, T3]));
  if (path.includes('/d2/slots')) return Promise.resolve(slots('d2', [T1]));
  return Promise.reject(new Error(path));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation(directory);
});

describe('receptionist rules', () => {
  it('understands yes and no; "no" wins when both appear', () => {
    expect(yesNo('Yes, please book it')).toBe('yes');
    expect(yesNo('okay')).toBe('yes');
    expect(yesNo('No, another doctor')).toBe('no');
    expect(yesNo('no, book a different one')).toBe('no');
    expect(yesNo('what is the fee')).toBeNull();
  });

  it('offers the earliest free time, prefers the patient language, and skips declined doctors and taken times', async () => {
    const get = (p: string) => mockGet(p);
    const first = await findOffer(get, 'Pediatrics', 'Hindi', new Set());
    expect(first).toMatchObject({ doctor: { id: 'd2' }, startAt: T1 });
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('language=Hindi'));
    const otherDoctor = await findOffer(get, 'Pediatrics', 'Hindi', new Set(['d2']));
    expect(otherDoctor).toMatchObject({ doctor: { id: 'd1' }, startAt: T2 });
    const takenMeanwhile = await findOffer(
      get,
      'Pediatrics',
      'Hindi',
      new Set(['d2', offerKey(otherDoctor!)]),
    );
    expect(takenMeanwhile).toMatchObject({ doctor: { id: 'd1' }, startAt: T3 });
  });
});

describe('receptionist conversation', () => {
  const open = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ReceptionistModal visible onClose={jest.fn()} />
      </QueryClientProvider>,
    );
  const say = async (text: string) => {
    await userEvent.type(screen.getByLabelText('Type your problem'), text);
    await userEvent.press(screen.getByRole('button', { name: 'Send' }));
  };

  it('problem → one doctor → no → next doctor → yes books it', async () => {
    mockPost.mockResolvedValue({ id: 'a1', doctor: { id: 'd1' } });
    await open();
    expect(screen.getByText(/Tell me what the problem is/)).toBeOnTheScreen();
    await say('my child has fever');
    expect(await screen.findByText(/Dr. Ravi Rao, Pediatrics specialist/)).toBeOnTheScreen();
    await say('no');
    expect(await screen.findByText(/Dr. Meera Iyer, Pediatrics specialist/)).toBeOnTheScreen();
    await say('yes');
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/appointments',
        { doctorId: 'd1', startAt: T2, reasonNote: 'my child has fever' },
        { 'Idempotency-Key': 'key-1' },
      ),
    );
    expect(await screen.findByText(/You are booked with Dr. Meera Iyer/)).toBeOnTheScreen();
  });

  it('emergency words win at any point and never book', async () => {
    await open();
    await say('he is not breathing');
    expect(await screen.findByText(/call 108 or 112/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Call 108' })).toBeOnTheScreen();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('asks again when unclear, then falls back to a general physician', async () => {
    await open();
    await say('hello');
    expect(await screen.findByText(/Please tell me the problem/)).toBeOnTheScreen();
    await say('I feel strange');
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('specialization=General+Physician')),
    );
  });
});
