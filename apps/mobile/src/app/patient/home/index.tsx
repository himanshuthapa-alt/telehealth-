import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SPECIALIZATIONS, canJoinNow } from '@telecare/shared';
import { hasOptionalDetails, usePatientProfile } from '@/features/account/profile-queries';
import { AppointmentToken } from '@/features/appointments/AppointmentCard';
import { useAppointments } from '@/features/appointments/appointment-queries';
import { openRoom } from '@/features/consultation/JoinButton';
import { SPECIALTY } from '@/features/doctors/specialties';
import { ICONS } from '@/features/shell/icons';
import { BoloAssistantModal } from '@/features/triage/BoloAssistantModal';
import { useSession } from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { AppText, Button, Card, Icon, Screen, Tile, TileGrid, colors, radius, spacing } from '@/ui';

// The steps really are a sequence, so they are numbered.
const STEPS = [
  { icon: ICONS.doctor, title: 'Choose a doctor', body: 'Pick by your problem and your language.' },
  {
    icon: ICONS.video,
    title: 'Talk from home',
    body: 'A video call at your time. Chat works on a weak network.',
  },
  {
    icon: ICONS.medicines,
    title: 'Get your medicines',
    body: 'Order from the prescription and track the delivery.',
  },
];

/**
 * Home shows only what needs attention (blueprint §4): the next appointment,
 * one clear way to find a doctor, and problems in everyday words.
 */
export default function Home() {
  const state = useSession();
  const profile = usePatientProfile();
  const upcoming = useAppointments('upcoming');
  const next = upcoming.data?.[0];
  const now = useNow();
  const firstName = state.status === 'signedIn' ? state.user.fullName.split(' ')[0] : '';
  const [boloVisible, setBoloVisible] = useState(false);
  const findDoctor = (specialization?: string) =>
    router.navigate({ pathname: '/patient/doctors', params: specialization ? { specialization } : {} });

  return (
    <Screen edges={['top']}>
      <AppText variant="title">Namaste, {firstName}</AppText>

      {next && (
        <View style={styles.tokenGroup}>
          <AppointmentToken appointment={next} viewer="PATIENT" />
          {/* Blueprint §4, priority 1: a consultation open right now is the main action. */}
          {canJoinNow(next, now) ? (
            <Button label="Join now" icon={ICONS.video} onPress={() => openRoom(next.id)} />
          ) : (
            <Button
              label="See this booking"
              variant="secondary"
              icon={ICONS.bookings}
              onPress={() =>
                router.navigate({ pathname: '/patient/appointments/[id]', params: { id: next.id } })
              }
            />
          )}
        </View>
      )}

      <Button
        label="Find a doctor"
        variant={next && canJoinNow(next, now) ? 'secondary' : 'primary'}
        icon={ICONS.search}
        onPress={() => findDoctor()}
      />

      <Button
        label="बोलो / Bolo — Voice Doctor Search"
        variant="secondary"
        icon={ICONS.mic}
        onPress={() => setBoloVisible(true)}
      />

      <View style={styles.section}>
        <AppText variant="heading">What is troubling you?</AppText>
        <TileGrid>
          {SPECIALIZATIONS.map((s) => (
            <Tile
              key={s}
              icon={SPECIALTY[s].icon}
              label={SPECIALTY[s].plain}
              sublabel={s}
              onPress={() => findDoctor(s)}
            />
          ))}
        </TileGrid>
      </View>

      {upcoming.data?.length === 0 && (
        <View style={styles.section}>
          <AppText variant="heading">How it works</AppText>
          {STEPS.map((step, i) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepBadge}>
                <Icon name={step.icon} size={28} color="primary" />
                <AppText variant="caption" style={styles.stepNumber}>
                  {i + 1}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="label">{step.title}</AppText>
                <AppText color="textMuted">{step.body}</AppText>
              </View>
            </View>
          ))}
        </View>
      )}

      {profile.data && !hasOptionalDetails(profile.data) && (
        <Card>
          <AppText variant="label">Help your doctor prepare</AppText>
          <AppText color="textMuted">Add your age and language. It takes a minute and is optional.</AppText>
          <Button
            label="Add my details"
            variant="secondary"
            icon={ICONS.edit}
            onPress={() => router.navigate('/patient/profile/edit')}
          />
        </Card>
      )}

      <BoloAssistantModal visible={boloVisible} onClose={() => setBoloVisible(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  tokenGroup: { gap: spacing.sm, marginBottom: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 24,
    textAlign: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontWeight: '800',
    overflow: 'hidden',
  },
});
