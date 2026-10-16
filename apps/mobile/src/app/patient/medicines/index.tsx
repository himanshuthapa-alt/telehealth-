import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ICONS } from '@/features/shell/icons';
import { PrescriptionCard } from '@/features/prescriptions/PrescriptionCard';
import { usePrescriptions } from '@/features/prescriptions/prescription-queries';
import { EmptyState, QueryState, Screen, SegmentedControl, spacing } from '@/ui';

// Decision D6: one Medicines tab holding the whole "get my medicines" task.
const SEGMENTS = [
  { value: 'prescriptions', label: 'Prescriptions' },
  { value: 'catalog', label: 'Catalog' },
  { value: 'cart', label: 'Cart' },
  { value: 'orders', label: 'Orders' },
] as const;
type Segment = (typeof SEGMENTS)[number]['value'];

/** Prescriptions are live; catalog / cart / orders arrive in Phase 8. */
export default function Medicines() {
  const [segment, setSegment] = useState<Segment>('prescriptions');
  const prescriptions = usePrescriptions();
  const findDoctor = {
    label: 'Find a doctor',
    icon: ICONS.search,
    onPress: () => router.navigate('/patient/doctors'),
  };
  const empty: Record<Segment, React.ReactNode> = {
    prescriptions: (
      <QueryState
        query={prescriptions}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={ICONS.medicines}
            title="No prescriptions yet."
            body="After a consultation, your doctor's prescription appears here."
            action={findDoctor}
          />
        }
      >
        {(list) => (
          <View style={{ gap: spacing.md }}>
            {list.map((p) => (
              <PrescriptionCard
                key={p.id}
                prescription={p}
                onPress={() =>
                  router.push({ pathname: '/patient/medicines/prescription/[id]', params: { id: p.id } })
                }
              />
            ))}
          </View>
        )}
      </QueryState>
    ),
    catalog: (
      <EmptyState
        icon={ICONS.search}
        title="The medicine catalog opens soon."
        body="You'll be able to see medicines and prices."
      />
    ),
    cart: (
      <EmptyState
        icon={ICONS.medicines}
        title="Your cart is empty."
        body="Add medicines from a prescription or the catalog."
      />
    ),
    orders: (
      <EmptyState
        icon={ICONS.bookings}
        title="No orders yet."
        body="Your medicine orders and their delivery appear here."
      />
    ),
  };
  return (
    <Screen>
      <SegmentedControl segments={SEGMENTS} value={segment} onChange={setSegment} />
      {empty[segment]}
    </Screen>
  );
}
