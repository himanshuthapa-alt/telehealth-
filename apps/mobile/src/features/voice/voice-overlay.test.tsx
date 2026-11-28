import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { VoiceNavOverlay } from './VoiceNavOverlay';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  router: { navigate: (...a: unknown[]) => mockNavigate(...a), back: jest.fn() },
}));
const mockGet = jest.fn();
const mockUpload = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), upload: (...a: unknown[]) => mockUpload(...a) },
}));
const mockSpeak = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('./speech-api', () => ({ speak: (...a: unknown[]) => mockSpeak(...a) }));

globalThis.fetch = jest.fn(() =>
  Promise.resolve({ blob: () => Promise.resolve({ type: 'audio/mp4' }) }),
) as never;

const renderOverlay = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VoiceNavOverlay />
    </QueryClientProvider>,
  );

beforeEach(() => jest.clearAllMocks());

describe('voice in Indian languages (Sarvam on the server)', () => {
  it('records, understands Tamil, navigates, and answers in Tamil', async () => {
    mockGet.mockResolvedValue({ indianLanguages: true });
    mockUpload.mockResolvedValue({
      transcript: 'my child has fever',
      languageCode: 'ta-IN',
      intent: { kind: 'find_doctor', specialization: 'Pediatrics' },
    });
    await renderOverlay();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/v1/voice/capabilities'));
    const mic = await screen.findByLabelText(/Voice navigation/);
    await userEvent.press(mic);
    expect(await screen.findByText(/speak in any Indian language/)).toBeOnTheScreen();
    await userEvent.press(screen.getByLabelText(/Listening/));
    expect(await screen.findByText(/my child has fever \(Tamil\)/)).toBeOnTheScreen();
    expect(mockUpload).toHaveBeenCalledWith('/v1/voice/understand', expect.anything(), 'audio/mp4');
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/patient/doctors',
      params: { specialization: 'Pediatrics' },
    });
    expect(mockSpeak).toHaveBeenCalledWith('Finding a Pediatrics doctor', 'ta-IN');
  });

  it('an emergency in any language shows the call buttons and does not navigate', async () => {
    mockGet.mockResolvedValue({ indianLanguages: true });
    mockUpload.mockResolvedValue({
      transcript: 'save me, he is not breathing',
      languageCode: 'hi-IN',
      intent: { kind: 'emergency' },
    });
    await renderOverlay();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await userEvent.press(await screen.findByLabelText(/Voice navigation/));
    await userEvent.press(await screen.findByLabelText(/Listening/));
    expect(await screen.findByLabelText('Call 108, ambulance')).toBeOnTheScreen();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('a failed upload asks to try again', async () => {
    mockGet.mockResolvedValue({ indianLanguages: true });
    mockUpload.mockRejectedValue(new Error('502'));
    await renderOverlay();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await userEvent.press(await screen.findByLabelText(/Voice navigation/));
    await userEvent.press(await screen.findByLabelText(/Listening/));
    expect(await screen.findByText(/couldn't hear that clearly/)).toBeOnTheScreen();
  });
});
