import { useState } from 'react';
import { router } from 'expo-router';
import { AppointmentList } from '@/features/appointments/AppointmentList';
import { EmptyState, Screen, SegmentedControl } from '@/ui';

const SEGMENTS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
] as const;

export default function DoctorAppointments() {
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]['value']>('upcoming');
  const open = (id: string) => router.push({ pathname: '/doctor/appointments/[id]', params: { id } });
  return (
    <Screen>
      <SegmentedControl segments={SEGMENTS} value={segment} onChange={setSegment} />
      <AppointmentList
        key={segment}
        scope={segment}
        viewer="DOCTOR"
        onOpen={open}
        empty={
          <EmptyState
            title={segment === 'upcoming' ? 'No upcoming appointments.' : 'No past appointments.'}
            body={segment === 'upcoming' ? 'New bookings appear here as patients make them.' : undefined}
          />
        }
      />
    </Screen>
  );
}
