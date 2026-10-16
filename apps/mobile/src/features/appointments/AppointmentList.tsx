import { View } from 'react-native';
import type { AppointmentScope } from '@telecare/shared';
import { QueryState, spacing } from '@/ui';
import { AppointmentCard } from './AppointmentCard';
import { useAppointments } from './appointment-queries';

/** A list of the caller's appointments, with the §18 states. */
export function AppointmentList({
  scope,
  viewer,
  empty,
  onOpen,
}: {
  scope: AppointmentScope;
  viewer: 'PATIENT' | 'DOCTOR';
  empty: React.ReactNode;
  onOpen: (id: string) => void;
}) {
  const list = useAppointments(scope);
  return (
    <QueryState query={list} isEmpty={(items) => items.length === 0} empty={empty}>
      {(items) => (
        <View style={{ gap: spacing.md }}>
          {items.map((a) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              viewer={viewer}
              timeOnly={scope === 'today'}
              onPress={() => onOpen(a.id)}
            />
          ))}
        </View>
      )}
    </QueryState>
  );
}
