import { router, useLocalSearchParams } from 'expo-router';
import { AppointmentToken } from '@/features/appointments/AppointmentCard';
import { useAppointment } from '@/features/appointments/appointment-queries';
import { ICONS } from '@/features/shell/icons';
import { AppText, Banner, Button, Screen } from '@/ui';

/** Booking result. Replaces the review screen, so Back doesn't reopen a sent form. */
export default function Booked() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appointment = useAppointment(id).data;
  return (
    <Screen>
      <Banner tone="success" message="Booked. This is your token." />
      {appointment && <AppointmentToken appointment={appointment} viewer="PATIENT" />}
      <AppText>You will find it any time under Bookings, and on your Home screen.</AppText>
      <Button
        label="Open my booking"
        icon={ICONS.bookings}
        onPress={() => router.navigate({ pathname: '/patient/appointments/[id]', params: { id } })}
      />
      <Button
        label="Back to Home"
        variant="ghost"
        icon={ICONS.home}
        onPress={() => router.navigate('/patient/home')}
      />
    </Screen>
  );
}
