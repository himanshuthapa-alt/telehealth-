import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { DoctorForReview, DoctorVerificationStatus } from '@telecare/shared';
import { useDecideDoctor, useDoctorsForReview } from '@/features/doctor-account/queries';
import { ICONS } from '@/features/shell/icons';
import { useSubmit } from '@/lib/use-submit';
import {
  AppText,
  Banner,
  Button,
  Card,
  EmptyState,
  QueryState,
  Screen,
  SegmentedControl,
  TextField,
  spacing,
} from '@/ui';

const SEGMENTS = [
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

/** Admin queue: check each doctor's registration number, then approve or reject. */
export default function VerifyDoctors() {
  const [status, setStatus] = useState<DoctorVerificationStatus>('PENDING');
  const query = useDoctorsForReview(status);
  return (
    <Screen edges={['top']}>
      <AppText variant="title">Verify doctors</AppText>
      <SegmentedControl segments={SEGMENTS} value={status} onChange={setStatus} />
      <QueryState
        query={query}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            title={status === 'PENDING' ? 'No doctors waiting.' : 'Nobody here yet.'}
            body="New doctor sign-ups appear under Waiting."
          />
        }
      >
        {(list) => list.map((d) => <DoctorReviewCard key={d.id} doctor={d} />)}
      </QueryState>
    </Screen>
  );
}

function DoctorReviewCard({ doctor }: { doctor: DoctorForReview }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const decide = useDecideDoctor();
  const { submit, busy, message, fields } = useSubmit(async (approve: boolean) => {
    await decide.mutateAsync(
      approve
        ? { id: doctor.id, status: 'APPROVED' }
        : { id: doctor.id, status: 'REJECTED', note: note.trim() },
    );
  });

  return (
    <Card>
      <AppText variant="heading">{doctor.fullName}</AppText>
      <Row label="Registration no." value={doctor.registrationNumber ?? '—'} />
      <Row label="Mobile" value={doctor.phone} />
      <Row label="Specializations" value={doctor.specializations.join(', ')} />
      <Row label="Languages" value={doctor.languages.join(', ')} />
      <Row label="Experience" value={`${doctor.experienceYears} years`} />
      <Row label="Fee" value={`₹${doctor.feeInr}`} />
      <Row label="Signed up" value={new Date(doctor.createdAt).toLocaleDateString('en-IN')} />
      {doctor.bio ? <AppText variant="small">{doctor.bio}</AppText> : null}
      {doctor.verificationNote && <Banner tone="warning" message={doctor.verificationNote} />}
      {message && <Banner tone="danger" message={fields.note ?? message} />}

      {rejecting ? (
        <>
          <TextField
            label="Reason (the doctor sees this)"
            value={note}
            onChangeText={setNote}
            maxLength={300}
            placeholder="e.g. Number not found in the State Medical Council register"
          />
          <Button
            label="Reject"
            variant="danger"
            icon={ICONS.cancel}
            loading={busy}
            disabled={!note.trim()}
            onPress={() => void submit(false)}
          />
          <Button label="Back" variant="ghost" onPress={() => setRejecting(false)} />
        </>
      ) : (
        <>
          {doctor.verificationStatus !== 'APPROVED' && (
            <Button label="Approve" icon={ICONS.check} loading={busy} onPress={() => void submit(true)} />
          )}
          {doctor.verificationStatus !== 'REJECTED' && (
            <Button
              label={doctor.verificationStatus === 'APPROVED' ? 'Remove approval' : 'Reject'}
              variant="secondary"
              onPress={() => setRejecting(true)}
            />
          )}
        </>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText color="textMuted">{label}</AppText>
      <AppText style={styles.value}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  value: { flexShrink: 1, textAlign: 'right' },
});
