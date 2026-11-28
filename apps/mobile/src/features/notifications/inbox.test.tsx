import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { NotificationList } from '@telecare/shared';
import { InboxBell, InboxScreen } from './Inbox';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
}));

const inbox: NotificationList = {
  unread: 2,
  items: [
    {
      id: 'n2',
      title: 'Order TC-AB12-CD34: on the way',
      body: 'Tap to see where your medicines are.',
      link: '/patient/medicines/order/o1',
      read: false,
      createdAt: '2030-01-07T06:00:00Z',
    },
    {
      id: 'n1',
      title: 'Your prescription is ready',
      body: 'Open it to see your medicines.',
      link: '/patient/medicines/prescription/rx1',
      read: false,
      createdAt: '2030-01-07T05:00:00Z',
    },
  ],
};

let client: QueryClient;
const renderScreen = (ui: ReactElement) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};
afterEach(() => client?.clear());
beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue(undefined);
});

describe('inbox', () => {
  it('the bell shows how many are new and opens the inbox', async () => {
    mockGet.mockResolvedValue(inbox);
    await renderScreen(<InboxBell />);
    const bell = await screen.findByLabelText('Notifications, 2 new');
    await userEvent.press(bell);
    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('lists newest first, marks all read on open, and each one opens its screen', async () => {
    mockGet.mockResolvedValue(inbox);
    await renderScreen(<InboxScreen />);
    expect(await screen.findByText('Order TC-AB12-CD34: on the way')).toBeOnTheScreen();
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/v1/notifications/read'));
    await userEvent.press(screen.getByText('Your prescription is ready'));
    expect(mockPush).toHaveBeenCalledWith('/patient/medicines/prescription/rx1');
  });

  it('says so when there is nothing', async () => {
    mockGet.mockResolvedValue({ unread: 0, items: [] });
    await renderScreen(<InboxScreen />);
    expect(await screen.findByText('Nothing yet.')).toBeOnTheScreen();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
