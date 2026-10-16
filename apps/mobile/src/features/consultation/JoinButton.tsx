import { router } from 'expo-router';
import { canJoinNow, joinWindow, type Appointment } from '@telecare/shared';
import { formatTime } from '@/features/appointments/format';
import { ICONS } from '@/features/shell/icons';
import { useNow } from '@/lib/use-now';
import { AppText, Button } from '@/ui';

export const openRoom = (appointmentId: string) =>
  router.push({ pathname: '/consultation/[appointmentId]', params: { appointmentId } });

/** "Join consultation" while the window is open; otherwise when it opens. Same rule as the API. */
export function JoinButton({
  appointment: a,
  label = 'Join consultation',
}: {
  appointment: Appointment;
  label?: string;
}) {
  const now = useNow();
  if (a.status !== 'BOOKED') return null;
  if (canJoinNow(a, now)) return <Button label={label} icon={ICONS.video} onPress={() => openRoom(a.id)} />;
  const { opensAt, closesAt } = joinWindow(a);
  if (now >= closesAt) return null;
  return (
    <AppText color="textMuted">
      The consultation room opens at {formatTime(opensAt)}, 10 minutes before your time. The Join button will
      appear here.
    </AppText>
  );
}
