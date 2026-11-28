import { InboxBell } from '@/features/notifications/Inbox';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SPECIALIZATIONS, canJoinNow } from '@telecare/shared';
import { hasOptionalDetails, usePatientProfile } from '@/features/account/profile-queries';
import { AppointmentToken } from '@/features/appointments/AppointmentCard';
import { useAppointments } from '@/features/appointments/appointment-queries';
import { openRoom } from '@/features/consultation/JoinButton';
import { SPECIALTY } from '@/features/doctors/specialties';
import { ICONS } from '@/features/shell/icons';
import { VoiceAssistantModal } from '@/features/voice/VoiceAssistantModal';
import { useSession } from '@/lib/api';
import { useNow } from '@/lib/use-now';
import {
  AppText,
  Button,
  Card,
  Icon,
  OfflineBanner,
  colors,
  radius,
  shadow,
  spacing,
  type IconName,
} from '@/ui';

const TRUST: { icon: IconName; text: string }[] = [
  { icon: ICONS.verified, text: 'Verified doctors' },
  { icon: ICONS.lock, text: 'Private & secure' },
  { icon: ICONS.medicines, text: 'Medicines delivered' },
];

const STEPS = [
  { icon: ICONS.doctor, title: 'Choose a doctor', body: 'By your problem and your language.' },
  { icon: ICONS.video, title: 'Talk from home', body: 'Video call; chat works on a weak network.' },
  { icon: ICONS.medicines, title: 'Get medicines', body: 'Order from the prescription, track it.' },
];

/**
 * Home: a blue header with search, the next appointment, four big actions,
 * problems in everyday words, and how it works. Shows only what needs
 * attention (blueprint §4).
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

  const actions: { icon: IconName; title: string; body: string; onPress: () => void }[] = [
    { icon: ICONS.video, title: 'Video consult', body: 'Talk to a doctor', onPress: () => findDoctor() },
    {
      icon: ICONS.medicines,
      title: 'Medicines',
      body: 'Order & track',
      onPress: () => router.navigate('/patient/medicines'),
    },
    {
      icon: ICONS.bookings,
      title: 'My bookings',
      body: 'Upcoming & past',
      onPress: () => router.navigate('/patient/appointments'),
    },
    { icon: ICONS.mic, title: 'बोलो · Speak', body: 'In your language', onPress: () => setBoloVisible(true) },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.greeting}>
            <View style={{ flex: 1 }}>
              <AppText variant="small" style={styles.heroMuted}>
                Namaste 🙏
              </AppText>
              <AppText variant="title" color="onPrimary">
                {firstName}
              </AppText>
            </View>
            <View style={styles.bell}>
              <InboxBell />
            </View>
          </View>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel="Search doctors by name or problem"
            onPress={() => findDoctor()}
            style={({ pressed }) => [styles.search, pressed && { opacity: 0.9 }]}
          >
            <Icon name={ICONS.search} size={22} color="textMuted" />
            <AppText color="textMuted">Search doctors, problems…</AppText>
          </Pressable>
        </View>

        <View style={styles.body}>
          <OfflineBanner />

          {next && (
            <Card>
              <AppText variant="caption" color="primary" style={styles.kicker}>
                YOUR NEXT CONSULTATION
              </AppText>
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
            </Card>
          )}

          <View style={styles.actions}>
            {actions.map((a) => (
              <Pressable
                key={a.title}
                accessibilityRole="button"
                accessibilityLabel={`${a.title}. ${a.body}`}
                onPress={a.onPress}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <View style={styles.actionIcon}>
                  <Icon name={a.icon} size={26} color="primary" />
                </View>
                <AppText variant="label">{a.title}</AppText>
                <AppText variant="caption" color="textMuted">
                  {a.body}
                </AppText>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionHead}>
            <AppText variant="heading">What is troubling you?</AppText>
            <Pressable accessibilityRole="link" onPress={() => findDoctor()} hitSlop={12}>
              <AppText variant="small" color="primary" style={{ fontWeight: '700' }}>
                See all
              </AppText>
            </Pressable>
          </View>
          <View style={styles.specialties}>
            {SPECIALIZATIONS.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityLabel={`${SPECIALTY[s].plain}, ${s}`}
                onPress={() => findDoctor(s)}
                style={({ pressed }) => [styles.specialty, pressed && styles.pressed]}
              >
                <View style={styles.specialtyIcon}>
                  <Icon name={SPECIALTY[s].icon} size={28} color="primary" />
                </View>
                <AppText variant="caption" style={styles.center} numberOfLines={2}>
                  {SPECIALTY[s].plain}
                </AppText>
              </Pressable>
            ))}
          </View>

          <View style={styles.trust}>
            {TRUST.map((t) => (
              <View key={t.text} style={styles.trustItem}>
                <Icon name={t.icon} size={20} color="success" />
                <AppText variant="caption" color="textMuted" style={styles.center}>
                  {t.text}
                </AppText>
              </View>
            ))}
          </View>

          {upcoming.data?.length === 0 && (
            <>
              <AppText variant="heading">How it works</AppText>
              <Card style={{ gap: spacing.md }}>
                {STEPS.map((step, i) => (
                  <View key={step.title} style={styles.step}>
                    <View style={styles.stepNumber}>
                      <AppText variant="label" color="onPrimary">
                        {i + 1}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="label">{step.title}</AppText>
                      <AppText variant="small" color="textMuted">
                        {step.body}
                      </AppText>
                    </View>
                    <Icon name={step.icon} size={24} color="primary" />
                  </View>
                ))}
              </Card>
            </>
          )}

          {profile.data && !hasOptionalDetails(profile.data) && (
            <Card>
              <AppText variant="label">Help your doctor prepare</AppText>
              <AppText variant="small" color="textMuted">
                Add your age and language. It takes a minute and is optional.
              </AppText>
              <Button
                label="Add my details"
                variant="secondary"
                icon={ICONS.edit}
                onPress={() => router.navigate('/patient/profile/edit')}
              />
            </Card>
          )}
        </View>
      </ScrollView>
      <VoiceAssistantModal visible={boloVisible} onClose={() => setBoloVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  scroll: { backgroundColor: colors.background, paddingBottom: 120, flexGrow: 1 },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroMuted: { color: '#D6E2FF' },
  greeting: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bell: { backgroundColor: colors.surface, borderRadius: radius.pill },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  body: { padding: spacing.md, gap: spacing.md, marginTop: -spacing.md },
  kicker: { fontWeight: '800', letterSpacing: 0.6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
    ...shadow,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  pressed: { backgroundColor: colors.primarySoft },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  specialties: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    ...shadow,
  },
  specialty: {
    width: '25%',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: radius.md,
    minHeight: 96,
  },
  specialtyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  trust: {
    flexDirection: 'row',
    backgroundColor: colors.successSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  trustItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
