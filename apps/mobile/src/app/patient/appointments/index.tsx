import { useState } from 'react';
import { router } from 'expo-router';
import { AppointmentList } from '@/features/appointments/AppointmentList';
import { ICONS } from '@/features/shell/icons';
import { EmptyState, Screen, SegmentedControl } from '@/ui';

const SEGMENTS = [
  { value: 'upcoming', label: 'Coming up' },
  { value: 'past', label: 'Past' },
] as const;

export default function Appointments() {
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]['value']>('upcoming');
  const open = (id: string) => router.push({ pathname: '/patient/appointments/[id]', params: { id } });
  return (
    <Screen>
      <SegmentedControl segments={SEGMENTS} value={segment} onChange={setSegment} />
      {segment === 'upcoming' ? (
        <AppointmentList
          scope="upcoming"
          viewer="PATIENT"
          onOpen={open}
          empty={
            <EmptyState
              icon={ICONS.bookings}
              title="No bookings yet."
              body="Book a doctor and your token will show here."
              action={{
                label: 'Find a doctor',
                icon: ICONS.search,
                onPress: () => router.navigate('/patient/doctors'),
              }}
            />
          }
        />
      ) : (
        <AppointmentList
          scope="past"
          viewer="PATIENT"
          onOpen={open}
          empty={
            <EmptyState
              icon={ICONS.calendar}
              title="No past bookings."
              body="Finished and cancelled bookings appear here."
            />
          }
        />
      )}
    </Screen>
  );
}
