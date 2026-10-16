import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { REASON_NOTE_MAX, istDate } from '@telecare/shared';
import { hasCode, useBookAppointment } from '@/features/appointments/appointment-queries';
import { formatDay, formatTime, formatWhen } from '@/features/appointments/format';
import { useDoctor } from '@/features/doctors/doctor-queries';
import { formatFee } from '@/features/doctors/format';
import { ICONS } from '@/features/shell/icons';
import { errorMessage } from '@/lib/errors';
import { AppText, Banner, Button, Screen, TextField, Token } from '@/ui';

/** Review and confirm a booking. */
export default function Review() {
  const { doctorId, startAt } = useLocalSearchParams<{ doctorId: string; startAt: string; endAt: string }>();
  const doctor = useDoctor(doctorId).data;
  const [reasonNote, setReasonNote] = useState('');
  // One key per visit to this screen, reused on every retry, so a slow or
  // dropped connection followed by "Confirm" again can never book twice.
  const [idempotencyKey] = useState(() => Crypto.randomUUID());
  const book = useBookAppointment();
  const slotGone = hasCode(book.error, 'SLOT_TAKEN') || hasCode(book.error, 'SLOT_UNAVAILABLE');

  function confirm() {
    book.mutate(
      { request: { doctorId, startAt, reasonNote: reasonNote.trim() || undefined }, idempotencyKey },
      // Replace this screen, so Back can't return to a form that was already sent (blueprint §6).
      { onSuccess: (a) => router.replace({ pathname: '/patient/doctors/booked', params: { id: a.id } }) },
    );
  }

  return (
    <Screen>
      <AppText variant="heading">Check your booking</AppText>
      <Token
        day={formatDay(istDate(startAt))}
        time={formatTime(startAt)}
        who={doctor?.name ?? 'Your doctor'}
        note={doctor ? `Fee ${formatFee(doctor.feeInr)}. Video call in this app.` : 'Video call in this app.'}
        accessibilityLabel={`Booking ${formatWhen(startAt)} with ${doctor?.name ?? 'your doctor'}${doctor ? `, fee ${formatFee(doctor.feeInr)}` : ''}`}
      />

      <TextField
        label="Reason for visit (optional)"
        hint="A few words help the doctor prepare, e.g. “fever for 3 days”."
        value={reasonNote}
        onChangeText={setReasonNote}
        maxLength={REASON_NOTE_MAX}
        multiline
      />

      {book.error && <Banner tone="danger" message={errorMessage(book.error)} />}
      {slotGone ? (
        <Button label="Pick another time" icon={ICONS.time} onPress={() => router.back()} />
      ) : (
        <Button
          label={book.error ? 'Try again' : 'Confirm booking'}
          icon={ICONS.check}
          onPress={confirm}
          loading={book.isPending}
        />
      )}
      <AppText variant="small" color="textMuted" style={{ textAlign: 'center' }}>
        You can cancel up to 2 hours before the start.
      </AppText>
    </Screen>
  );
}
