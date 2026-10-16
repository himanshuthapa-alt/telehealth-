import { useEffect } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { session, useSession } from '@/lib/api';
import { connectQueryClient, persistOptions, queryClient } from '@/lib/query';
import { AppText, Button, Screen, colors } from '@/ui';

void SplashScreen.preventAutoHideAsync();

/**
 * Chooses what the user can reach: the auth screens when logged out, and
 * only their own role's tabs when logged in (blueprint §6). This only picks
 * screens; the API enforces every permission itself.
 */
export default function RootLayout() {
  const state = useSession();

  useEffect(() => {
    void session.restore();
    return connectQueryClient();
  }, []);
  useEffect(() => {
    if (state.status !== 'loading') void SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === 'loading') return null; // splash screen stays up
  const role = state.status === 'signedIn' ? state.user.role : null;

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!role}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={role === 'PATIENT'}>
          <Stack.Screen name="patient" />
        </Stack.Protected>
        <Stack.Protected guard={role === 'DOCTOR'}>
          <Stack.Screen name="doctor" />
        </Stack.Protected>
        <Stack.Protected guard={role === 'PHARMACY_ADMIN'}>
          <Stack.Screen name="pharmacy" />
        </Stack.Protected>
        <Stack.Protected guard={!!role}>
          <Stack.Screen
            name="consultation/[appointmentId]"
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="prescription/[consultationId]"
            options={{
              headerShown: true,
              title: 'Prescription',
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="change-password"
            options={{ headerShown: true, title: 'Change password', presentation: 'modal' }}
          />
        </Stack.Protected>
      </Stack>
    </PersistQueryClientProvider>
  );
}

/** Last-resort screen if any screen crashes while rendering (blueprint §18), instead of a blank app. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen edges={['top']}>
      <AppText variant="title">Something went wrong</AppText>
      <AppText>The app hit an unexpected problem. Your data is safe on our server.</AppText>
      <Button
        label="Try again"
        icon={{ android: 'refresh', ios: 'arrow.clockwise' }}
        onPress={() => void retry()}
      />
    </Screen>
  );
}
