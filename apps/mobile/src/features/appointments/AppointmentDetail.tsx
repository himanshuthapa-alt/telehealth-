import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PATIENT_CANCEL_CUTOFF_MINUTES, patientCanCancel, type Appointment } from '@telecare/shared';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { AppText, Banner, Button, Card, QueryState, Screen, Skeleton, TextField, spacing } from '@/ui';
import { router } from 'expo-router';
import { JoinButton } from '@/features/consultation/JoinButton';
import { ICONS } from '@/features/shell/icons';
import { AppointmentToken, StatusPill } from './AppointmentCard';
import { useAppointment, useCancelAppointment } from './appointment-queries';
import { formatWhen } from './format';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText color="textMuted">{label}</AppText>
      <AppText style={styles.value}>{value}</AppText>
    </View>
  );
}

function CancelSection({
  appointment: a,
  viewer,
}: {
  appointment: Appointment;
  viewer: 'PATIENT' | 'DOCTOR';
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useCancelAppointment(a.id);
  const allowed = viewer === 'PATIENT' ? patientCanCancel(a) : new Date() < new Date(a.startAt);
  const reasonRequired = viewer === 'DOCTOR';

  if (a.status !== 'BOOKED') return null;
  if (!allowed)
    return (
      <AppText variant="small" color="textMuted">
        {viewer === 'PATIENT'
          ? `Appointments can be cancelled in the app up to ${PATIENT_CANCEL_CUTOFF_MINUTES / 60} hours before the start.`
          : 'This appointment has started and can no longer be cancelled.'}
      </AppText>
    );
  if (!open)
    return (
      <Button label="Cancel appointment" variant="danger" icon={ICONS.cancel} onPress={() => setOpen(true)} />
    );

  const tooShort = reasonRequired && reason.trim().length < 3;
  return (
    <Card>
      <AppText variant="label">Cancel this appointment?</AppText>
      <TextField
        label={reasonRequired ? 'Reason for the patient' : 'Reason (optional)'}
        value={reason}
        onChangeText={setReason}
        maxLength={200}
        error={fieldErrors(cancel.error).reason}
      />
      {cancel.error && <Banner tone="danger" message={errorMessage(cancel.error)} />}
      <Button
        label="Yes, cancel it"
        variant="danger"
        icon={ICONS.cancel}
        disabled={tooShort}
        loading={cancel.isPending}
        onPress={() => cancel.mutate(reason.trim() || null)}
      />
      <Button label="Keep it" variant="ghost" icon={ICONS.check} onPress={() => setOpen(false)} />
    </Card>
  );
}

/** One appointment, for its patient or its doctor. */
export function AppointmentDetail({ id, viewer }: { id: string; viewer: 'PATIENT' | 'DOCTOR' }) {
  const appointment = useAppointment(id);
  return (
    <Screen>
      <QueryState query={appointment} loading={<Skeleton cards={2} />}>
        {(a) => (
          <>
            {a.status === 'BOOKED' && <AppointmentToken appointment={a} viewer={viewer} />}
            <Card>
              <View style={styles.title}>
                <AppText variant="heading" style={{ flex: 1 }}>
                  {viewer === 'PATIENT' ? a.doctor.name : a.patient.name}
                </AppText>
                <StatusPill status={a.status} />
              </View>
              <Row label="When" value={formatWhen(a.startAt)} />
              {viewer === 'PATIENT' && <Row label="Specialty" value={a.doctor.specializations.join(', ')} />}
              {viewer === 'DOCTOR' && (
                <Row label="Age" value={a.patient.age !== null ? `${a.patient.age} years` : 'Not given'} />
              )}
              <Row label="Reason" value={a.reasonNote ?? 'Not given'} />
              {a.status === 'CANCELLED' && (
                <Row
                  label="Cancelled by"
                  value={`${a.cancelledBy === 'DOCTOR' ? 'Doctor' : 'Patient'}${a.cancelReason ? `: ${a.cancelReason}` : ''}`}
                />
              )}
            </Card>
            <JoinButton
              appointment={a}
              label={viewer === 'DOCTOR' ? 'Open consultation room' : 'Join consultation'}
            />
            {viewer === 'DOCTOR' && a.status === 'COMPLETED' && a.consultationId && (
              <Button
                label="Prescription"
                icon={ICONS.medicines}
                onPress={() =>
                  router.push({
                    pathname: '/prescription/[consultationId]',
                    params: { consultationId: a.consultationId! },
                  })
                }
              />
            )}
            <CancelSection appointment={a} viewer={viewer} />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  value: { flexShrink: 1, textAlign: 'right' },
});
