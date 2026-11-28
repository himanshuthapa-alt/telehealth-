import { Stack } from 'expo-router';
import { colors } from '@/ui';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'Log in' }} />
      <Stack.Screen name="register" options={{ title: 'Create account' }} />
      <Stack.Screen name="register-doctor" options={{ title: 'Join as a doctor' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Forgot password' }} />
      <Stack.Screen name="reset-password" options={{ title: 'Set a new password' }} />
    </Stack>
  );
}
