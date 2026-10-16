import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { PatientProfile } from '@telecare/shared';
import { GENDER_LABEL, formatDay, parseDay } from '@/features/account/format';
import { usePatientProfile } from '@/features/account/profile-queries';
import { ICONS } from '@/features/shell/icons';
import { session } from '@/lib/api';
import { AppText, Button, Card, QueryState, Screen, Skeleton, spacing } from '@/ui';

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value ?? 'not added'}`}>
      <AppText color="textMuted">{label}</AppText>
      <AppText color={value ? 'text' : 'textDisabled'} style={styles.value}>
        {value ?? 'Not added'}
      </AppText>
    </View>
  );
}

function Details({ profile }: { profile: PatientProfile }) {
  return (
    <Card>
      <AppText variant="heading">{profile.fullName}</AppText>
      <Row label="Mobile" value={profile.phone} />
      <Row label="Date of birth" value={profile.dateOfBirth && formatDay(parseDay(profile.dateOfBirth))} />
      <Row label="Gender" value={profile.gender && GENDER_LABEL[profile.gender]} />
      <Row label="Language" value={profile.preferredLanguage} />
      <Row label="District" value={profile.district} />
      <Button
        label="Edit my details"
        variant="secondary"
        icon={ICONS.edit}
        onPress={() => router.push('/patient/profile/edit')}
      />
    </Card>
  );
}

export default function Profile() {
  const profile = usePatientProfile();
  return (
    <Screen>
      <QueryState query={profile} loading={<Skeleton cards={1} />}>
        {(data) => <Details profile={data} />}
      </QueryState>
      <Button
        label="Change password"
        variant="secondary"
        icon={ICONS.lock}
        onPress={() => router.push('/change-password')}
      />
      <Button
        label="About & privacy"
        variant="secondary"
        icon={ICONS.info}
        onPress={() => router.push('/patient/profile/about')}
      />
      <Button
        label="Log out"
        variant="ghost"
        icon={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right' }}
        onPress={() => void session.logout()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  value: { flexShrink: 1, textAlign: 'right' },
});
