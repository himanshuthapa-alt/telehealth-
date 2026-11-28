import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { Consultation } from '@telecare/shared';
import { useAppointment } from '@/features/appointments/appointment-queries';
import { formatTime } from '@/features/appointments/format';
import { Chat } from '@/features/consultation/Chat';
import { useConsultationRoom } from '@/features/consultation/use-consultation-room';
import { VideoPanel } from '@/features/consultation/VideoPanel';
import { ICONS } from '@/features/shell/icons';
import { useSession } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { AppText, Banner, Button, Icon, Skeleton, colors, radius, spacing } from '@/ui';

type Viewer = 'PATIENT' | 'DOCTOR';

/** One line per person: icon + words, never colour alone. */
function Presence({ label, here }: { label: string; here: boolean }) {
  return (
    <View style={styles.presence}>
      <Icon name={here ? ICONS.check : ICONS.time} size={22} color={here ? 'success' : 'textMuted'} />
      <AppText color={here ? 'success' : 'textMuted'} style={{ fontWeight: '600' }}>
        {label}: {here ? 'in the room' : 'not here yet'}
      </AppText>
    </View>
  );
}

function statusLine(c: Consultation, viewer: Viewer): string {
  if (c.status === 'ACTIVE') return 'Consultation in progress';
  if (c.status === 'COMPLETED') return 'This consultation has ended';
  if (c.status === 'EXPIRED') return 'This consultation was not started in time';
  if (viewer === 'DOCTOR')
    return c.present.patient
      ? 'Your patient is waiting. Start when ready.'
      : 'Waiting for your patient to join';
  return c.present.doctor ? 'The doctor is here and will start soon' : 'Waiting for the doctor to start';
}

/**
 * The consultation room: full screen and outside the tab bar, so nobody leaves
 * it by tapping a tab (blueprint §6). Waiting room, video, chat and the
 * doctor's Start/End are all here.
 */
export default function ConsultationRoom() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  const session = useSession();
  const viewer: Viewer =
    session.status === 'signedIn' && session.user.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';
  const myId = session.status === 'signedIn' ? session.user.id : '';
  const myName = session.status === 'signedIn' ? session.user.fullName : '';
  const appointment = useAppointment(appointmentId).data;
  const otherName = appointment
    ? viewer === 'PATIENT'
      ? appointment.doctor.name
      : appointment.patient.name
    : '';
  const room = useConsultationRoom(appointmentId);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const run = (fn: () => Promise<void>) => {
    setActionError(null);
    fn().catch(setActionError);
  };
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const header = (
    <View style={styles.header}>
      <AppText variant="heading" style={{ flex: 1 }} numberOfLines={1}>
        {otherName || 'Consultation'}
      </AppText>
      <Button label="Leave" variant="ghost" icon={ICONS.leave} onPress={leave} />
    </View>
  );

  if (room.room.phase !== 'in') {
    const err = room.room.phase === 'error' ? room.room.error : null;
    const notOpen =
      err instanceof ApiError && err.failure.kind === 'http' && err.failure.code === 'JOIN_NOT_OPEN';
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.body}>
          {room.room.phase === 'joining' && <Skeleton cards={2} />}
          {err !== null && (
            <>
              <Banner
                tone={notOpen ? 'info' : 'danger'}
                message={
                  notOpen && appointment
                    ? `The room opens at ${formatTime(new Date(new Date(appointment.startAt).getTime() - 10 * 60_000))}, 10 minutes before your time.`
                    : errorMessage(err)
                }
              />
              <Button
                label="Try again"
                icon={{ android: 'refresh', ios: 'arrow.clockwise' }}
                onPress={room.rejoin}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { consultation: c, video } = room.room;
  const open = c.status === 'WAITING' || c.status === 'ACTIVE';

  return (
    <SafeAreaView style={styles.safe}>
      {header}
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.status} accessibilityLiveRegion="polite">
          <AppText variant="label">{statusLine(c, viewer)}</AppText>
          {open && (
            <>
              <Presence label="Doctor" here={c.present.doctor} />
              <Presence label="Patient" here={c.present.patient} />
            </>
          )}
        </View>

        {!room.connected && (
          <Banner tone="warning" message="Connection lost. Reconnecting… Your messages are kept." />
        )}
        {actionError !== null && <Banner tone="danger" message={errorMessage(actionError)} />}

        {c.status === 'ACTIVE' && (
          <VideoPanel video={video} name={myName} onVideoFailed={() => void room.reportVideoFailed()} />
        )}

        {viewer === 'DOCTOR' && (c.status === 'ACTIVE' || c.status === 'COMPLETED') && (
          <Button
            label="Write prescription"
            variant="secondary"
            icon={ICONS.medicines}
            onPress={() =>
              router.push({ pathname: '/prescription/[consultationId]', params: { consultationId: c.id } })
            }
          />
        )}
        {viewer === 'DOCTOR' && c.status === 'WAITING' && (
          <Button label="Start consultation" icon={ICONS.play} onPress={() => run(room.start)} />
        )}
        {viewer === 'DOCTOR' &&
          c.status === 'ACTIVE' &&
          (confirmEnd ? (
            <View style={styles.confirm}>
              <AppText variant="label">End the consultation for both of you?</AppText>
              <Button label="Yes, end it" variant="danger" icon={ICONS.stop} onPress={() => run(room.end)} />
              <Button
                label="Keep going"
                variant="ghost"
                icon={ICONS.check}
                onPress={() => setConfirmEnd(false)}
              />
            </View>
          ) : (
            <Button
              label="End consultation"
              variant="danger"
              icon={ICONS.stop}
              onPress={() => setConfirmEnd(true)}
            />
          ))}

        <Chat
          messages={room.messages}
          outbox={room.outbox}
          myId={myId}
          otherName={otherName || (viewer === 'PATIENT' ? 'Doctor' : 'Patient')}
          canSend={open}
          onSend={room.send}
          onRetry={room.retry}
          onOpenPrescription={(id) =>
            viewer === 'PATIENT'
              ? router.push({ pathname: '/patient/medicines/prescription/[id]', params: { id } })
              : router.push({ pathname: '/prescription/[consultationId]', params: { consultationId: c.id } })
          }
        />

        {!open && <Button label="Back to my bookings" icon={ICONS.bookings} onPress={leave} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md, gap: spacing.sm },
  body: { flex: 1, padding: spacing.md, gap: spacing.sm },
  status: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  presence: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  confirm: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
