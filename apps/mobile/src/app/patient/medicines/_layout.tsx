import { Stack } from 'expo-router';
import { stackScreenOptions } from '@/features/shell/tab-options';

export default function Layout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Medicines' }} />
      <Stack.Screen name="prescription/[id]" options={{ title: 'Prescription' }} />
      <Stack.Screen name="order-builder" options={{ title: 'Order Medicines' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order & Tracking' }} />
    </Stack>
  );
}
