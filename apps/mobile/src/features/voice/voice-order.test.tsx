import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { Prescription } from '@telecare/shared';
import { VoiceOrderModal, voiceOrderFor } from './VoiceOrderModal';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
}));
jest.mock('./speech-api', () => ({ speak: () => Promise.resolve() }));

const item = (
  id: string,
  name: string,
  quantity: number,
  orderedQuantity: number,
  medicineId: string | null,
) => ({
  id,
  medicineId,
  medicineName: name,
  dosage: '1 tablet',
  frequency: 'TWICE_A_DAY' as const,
  durationDays: 5,
  quantity,
  instructions: null,
  inCatalog: medicineId !== null,
  pricePaise: medicineId ? 5000 : null,
  packSize: '10 tablets',
  orderedQuantity,
});
const RX = {
  id: 'rx1',
  status: 'ISSUED',
  doctor: { id: 'd', name: 'Dr. Meera Iyer', qualification: 'MBBS', registrationNumber: 'R1' },
  items: [
    item('i1', 'Paracetamol', 2, 0, 'm1'),
    item('i2', 'Amoxicillin', 3, 1, 'm2'), // 1 already ordered → 2 left
    item('i3', 'Cough syrup', 1, 1, 'm3'), // all ordered
    item('i4', 'Herbal tea', 1, 0, null), // not stocked
  ],
} as unknown as Prescription;
const ADDRESS = { fullName: 'Asha Devi', phone: '9000000001', addressLine: 'House 12', district: 'Almora' };

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VoiceOrderModal visible onClose={jest.fn()} prescription={RX} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation((path: string) =>
    Promise.resolve(path === '/v1/orders' ? [{ address: ADDRESS }] : { indianLanguages: false }),
  );
});

describe('order by voice', () => {
  it('orders only what is left, from stocked medicines', () => {
    const { items, totalPaise } = voiceOrderFor(RX);
    expect(items.map((i) => [i.id, i.packs])).toEqual([
      ['i1', 2],
      ['i2', 2],
    ]);
    expect(totalPaise).toBe(20000);
  });

  it('reads the order, and "yes" places it to the last address, cash on delivery', async () => {
    mockPost.mockResolvedValue({ id: 'o1', trackingId: 'TC-AB12', totalPaise: 20000 });
    await open();
    expect(
      await screen.findByText(/2 medicines: Paracetamol, Amoxicillin\. Total 200 rupees/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/House 12, Almora/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/v1/orders', {
        prescriptionId: 'rx1',
        address: ADDRESS,
        items: [
          { prescriptionItemId: 'i1', medicineId: 'm1', quantity: 2 },
          { prescriptionItemId: 'i2', medicineId: 'm2', quantity: 2 },
        ],
      }),
    );
    expect(await screen.findByText(/tracking ID is TC-AB12/)).toBeOnTheScreen();
  });

  it('"no" orders nothing', async () => {
    await open();
    await screen.findByText(/Shall I order it/);
    await userEvent.press(screen.getByRole('button', { name: 'No' }));
    expect(await screen.findByText(/I won't order it/)).toBeOnTheScreen();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('first order: asks for the address on the form instead of guessing', async () => {
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(path === '/v1/orders' ? [] : { indianLanguages: false }),
    );
    await open();
    expect(await screen.findByText(/I need your delivery address once/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open the order form' })).toBeOnTheScreen();
  });
});
