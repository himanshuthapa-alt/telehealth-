import { Stack } from 'expo-router';
import { stackScreenOptions } from '@/features/shell/tab-options';

export default function Layout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Availability' }} />
    </Stack>
  );
}
