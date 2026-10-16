import { Stack } from 'expo-router';
import { stackScreenOptions } from '@/features/shell/tab-options';

export default function Layout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Find a doctor' }} />
      <Stack.Screen name="[id]" options={{ title: 'Doctor' }} />
      <Stack.Screen name="slots" options={{ title: 'Choose a time' }} />
      <Stack.Screen name="review" options={{ title: 'Confirm booking' }} />
      <Stack.Screen name="booked" options={{ title: 'Booked', headerBackVisible: false }} />
    </Stack>
  );
}
