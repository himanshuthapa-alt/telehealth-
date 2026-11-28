import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { MedicineSummary, Prescription } from '@telecare/shared';
import PatientPrescription from '@/app/patient/medicines/prescription/[id]';
import PrescriptionScreen from '@/app/prescription/[consultationId]';
import { Chat } from '@/features/consultation/Chat';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    get: (...a: unknown[]) => mockGet(...a),
    post: (...a: unknown[]) => mockPost(...a),
    put: (...a: unknown[]) => mockPut(...a),
  },
}));

const base: Prescription = {
  id: 'rx1',
  consultationId: 'c1',
  status: 'ISSUED',
  doctor: { id: 'doc1', name: 'Dr. Meera Iyer', qualification: 'MBBS, MD', registrationNumber: 'DMC-1234' },
  patient: { id: 'pat1', name: 'Asha Devi', age: 34 },
  items: [
    {
      id: 'i1',
      medicineId: 'm1',
      medicineName: 'Paracetamol 500 mg',
      dosage: '1 tablet',
      frequency: 'TWICE_A_DAY',
      durationDays: 5,
      quantity: 10,
      instructions: 'After food',
      inCatalog: true,
    },
    {
      id: 'i2',
      medicineId: null,
      medicineName: 'Steam inhalation',
      dosage: '10 minutes',
      frequency: 'AT_BEDTIME',
      durationDays: 3,
      quantity: 1,
      instructions: null,
      inCatalog: false,
    },
  ],
  generalInstructions: 'Drink plenty of water.',
  validDays: 30,
  validUntil: '2099-01-01',
  issuedAt: '2030-01-07T05:00:00Z',
  voidedAt: null,
  voidReason: null,
  supersedesId: null,
  createdAt: '2030-01-07T04:50:00Z',
};

let client: QueryClient;
const renderScreen = (ui: ReactElement) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
afterEach(() => client?.clear());
beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
});

describe('patient prescription', () => {
  it('says how much, when (morning / night in words and pictures) and for how long', async () => {
    mockParams = { id: 'rx1' };
    mockGet.mockResolvedValue(base);
    await renderScreen(<PatientPrescription />);
    expect(await screen.findByText('Paracetamol 500 mg')).toBeOnTheScreen();
    expect(screen.getByLabelText('Twice a day: Morning, Night')).toBeOnTheScreen();
    expect(screen.getByText('5 days')).toBeOnTheScreen();
    expect(screen.getByText('After food')).toBeOnTheScreen();
    expect(screen.getByText(/Not sold by the TeleCare\+ pharmacy/)).toBeOnTheScreen(); // the free-text item
    expect(screen.getByText(/Valid until/)).toBeOnTheScreen();
    // Telemedicine Practice Guidelines 2020: qualification and registration number on every prescription.
    expect(screen.getByText('MBBS, MD · Reg. no. DMC-1234')).toBeOnTheScreen();
  });

  it('a withdrawn prescription says so and must not be used', async () => {
    mockParams = { id: 'rx1' };
    mockGet.mockResolvedValue({ ...base, status: 'VOIDED', voidReason: 'Wrong dose' });
    await renderScreen(<PatientPrescription />);
    expect(
      await screen.findByText(/withdrew this prescription: Wrong dose\. Do not use it\./),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Order these medicines' })).toBeNull();
  });
});

describe('doctor composer', () => {
  const draft: Prescription = {
    ...base,
    status: 'DRAFT',
    items: [],
    issuedAt: null,
    validUntil: null,
    generalInstructions: null,
  };
  const paracetamol: MedicineSummary = {
    id: 'm1',
    name: 'Paracetamol 500 mg',
    genericName: 'Paracetamol',
    form: 'TABLET',
    strength: '500 mg',
    packSize: '15 tablets',
    pricePaise: 2500,
    inStock: true,
    requiresPrescription: false,
  };

  it('adds a catalog medicine, keeps the quantity in step with the course, saves, then issues', async () => {
    mockParams = { consultationId: 'c1' };
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith('/v1/medicines') ? [paracetamol] : [draft]),
    );
    mockPut.mockImplementation((_path: string, body: Prescription) => Promise.resolve({ ...draft, ...body }));
    mockPost.mockResolvedValue({ ...base });
    await renderScreen(<PrescriptionScreen />);

    await userEvent.type(await screen.findByLabelText('Add a medicine'), 'para');
    await userEvent.press(
      await screen.findByRole('button', { name: 'Add Paracetamol 500 mg' }, { timeout: 2000 }),
    );
    expect(screen.getByDisplayValue('10')).toBeOnTheScreen(); // twice a day × 5 days
    await userEvent.press(screen.getByRole('button', { name: 'Three times a day' }));
    expect(screen.getByDisplayValue('15')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'After food' }));

    await userEvent.press(screen.getByRole('button', { name: 'Issue prescription' }));
    await userEvent.press(screen.getByRole('button', { name: 'Yes, issue it' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/v1/prescriptions/rx1/issue'));
    // Saved first, so what is issued is exactly what is on screen.
    expect(mockPut).toHaveBeenCalledWith('/v1/prescriptions/rx1', {
      items: [
        {
          medicineId: 'm1',
          medicineName: 'Paracetamol 500 mg',
          dosage: '1 tablet',
          frequency: 'THREE_TIMES_A_DAY',
          durationDays: 5,
          quantity: 15,
          instructions: 'After food',
        },
      ],
      generalInstructions: null,
      validDays: 30,
    });
    expect(mockPut.mock.invocationCallOrder[0]!).toBeLessThan(mockPost.mock.invocationCallOrder[0]!);
  });

  it('after issue, offers to withdraw only with a reason', async () => {
    mockParams = { consultationId: 'c1' };
    mockGet.mockResolvedValue([base]);
    await renderScreen(<PrescriptionScreen />);
    const withdraw = await screen.findByRole('button', { name: 'Withdraw and write a corrected one' });
    expect(withdraw).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason (the patient sees this)'), 'Wrong dose');
    expect(withdraw).toBeEnabled();
  });
});

describe('prescription card in the chat', () => {
  it('shows how many medicines and opens the prescription', async () => {
    const onOpen = jest.fn();
    await render(
      <Chat
        messages={[
          {
            id: 1,
            type: 'PRESCRIPTION_CARD',
            senderId: null,
            clientMsgId: null,
            body: JSON.stringify({ prescriptionId: 'rx1', itemCount: 2 }),
            createdAt: '2030-01-07T05:00:00Z',
          },
        ]}
        outbox={[]}
        myId="pat1"
        otherName="Dr. Meera Iyer"
        canSend={false}
        onSend={jest.fn()}
        onRetry={jest.fn()}
        onOpenPrescription={onOpen}
      />,
    );
    expect(screen.getByText('2 medicines')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Open the prescription' }));
    expect(onOpen).toHaveBeenCalledWith('rx1');
  });
});
