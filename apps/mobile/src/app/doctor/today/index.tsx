import { View } from 'react-native';
import { router } from 'expo-router';
import { InboxBell } from '@/features/notifications/Inbox';
import { istDate } from '@telecare/shared';
import { AppointmentList } from '@/features/appointments/AppointmentList';
import { formatDay } from '@/features/appointments/format';
import { StatsRow } from '@/features/doctor-account/StatsRow';
import { useSession } from '@/lib/api';
import { AppText, EmptyState, Screen } from '@/ui';

/** The doctor's schedule for today (IST), in time order. */
export default function Today() {
  const state = useSession();
  const name = state.status === 'signedIn' ? state.user.fullName : '';
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AppText variant="title" style={{ flex: 1 }}>
          {formatDay(istDate(new Date()))}
        </AppText>
        <InboxBell />
      </View>
      <AppText color="textMuted">{name}</AppText>
      <StatsRow />
      <AppointmentList
        scope="today"
        viewer="DOCTOR"
        onOpen={(id) => router.push({ pathname: '/doctor/today/[id]', params: { id } })}
        empty={
          <EmptyState
            title="No consultations today."
            body="Patients book from your free times. Check your hours in Availability."
            action={{ label: 'Open Availability', onPress: () => router.navigate('/doctor/availability') }}
          />
        }
      />
    </Screen>
  );
}
