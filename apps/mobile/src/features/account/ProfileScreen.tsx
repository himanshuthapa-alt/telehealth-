import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Role } from '@telecare/shared';
import { session, useSession } from '@/lib/api';
import { AppText, Button, Card, Screen, spacing } from '@/ui';

const ROLE_LABEL: Record<Role, string> = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  PHARMACY_ADMIN: 'Pharmacy admin',
  ADMIN: 'Admin',
};

/** Profile tab, shared by every role. `children` adds role-specific sections under the account card. */
export function ProfileScreen({ children }: { children?: ReactNode }) {
  const state = useSession();
  if (state.status !== 'signedIn') return null;
  const { user } = state;

  return (
    <Screen>
      <Card>
        <AppText variant="heading">{user.fullName}</AppText>
        <View style={styles.row}>
          <AppText color="textMuted">Mobile</AppText>
          <AppText>{user.phone}</AppText>
        </View>
        <View style={styles.row}>
          <AppText color="textMuted">Account type</AppText>
          <AppText>{ROLE_LABEL[user.role]}</AppText>
        </View>
      </Card>
      {children}
      <Button label="Change password" variant="secondary" onPress={() => router.push('/change-password')} />
      <Button label="Log out" variant="ghost" onPress={() => void session.logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
});
