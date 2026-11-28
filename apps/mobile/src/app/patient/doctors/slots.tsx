import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { SlotsResponse } from '@telecare/shared';
import { formatDay, formatTime } from '@/features/appointments/format';
import { useSlots } from '@/features/appointments/appointment-queries';
import { useDoctor } from '@/features/doctors/doctor-queries';
import { ICONS } from '@/features/shell/icons';
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  QueryState,
  Screen,
  Skeleton,
  colors,
  minTouchTarget,
  radius,
  spacing,
} from '@/ui';

/** A day to pick: the day in words and how many free times it has. Days with none stay visible but can't be picked. */
function DayButton({
  date,
  free,
  selected,
  onPress,
}: {
  date: string;
  free: number;
  selected: boolean;
  onPress: () => void;
}) {
  const day = formatDay(date);
  // "No times" not "Full": the API sends only free slots, so a day off and a fully booked day look the same.
  const count = free === 0 ? 'No times' : free === 1 ? '1 free' : `${free} free`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${day}, ${count}`}
      accessibilityState={{ selected, disabled: free === 0 }}
      disabled={free === 0}
      onPress={onPress}
      style={[styles.day, selected && styles.daySelected, free === 0 && styles.dayFull]}
    >
      <AppText variant="label" color={selected ? 'onAccent' : 'primary'} style={styles.center}>
        {day}
      </AppText>
      <AppText variant="caption" color={selected ? 'onAccent' : 'textMuted'} style={styles.center}>
        {count}
      </AppText>
    </Pressable>
  );
}

function Picker({ doctorId, days }: { doctorId: string; days: SlotsResponse['days'] }) {
  const [date, setDate] = useState(days.find((d) => d.slots.length > 0)?.date ?? days[0]!.date);
  const [startAt, setStartAt] = useState<string>();
  const day = days.find((d) => d.date === date)!;
  const chosen = day.slots.find((s) => s.startAt === startAt);

  return (
    <>
      <AppText variant="heading">1. Pick a day</AppText>
      <View style={styles.grid}>
        {days.map((d) => (
          <DayButton
            key={d.date}
            date={d.date}
            free={d.slots.length}
            selected={d.date === date}
            onPress={() => {
              setDate(d.date);
              setStartAt(undefined);
            }}
          />
        ))}
      </View>

      <AppText variant="heading">2. Pick a time ({formatDay(date)})</AppText>
      <View style={styles.grid}>
        {day.slots.map((s) => (
          <Chip
            key={s.startAt}
            even
            label={formatTime(s.startAt)}
            selected={s.startAt === startAt}
            onPress={() => setStartAt(s.startAt)}
          />
        ))}
      </View>

      <Button
        label={chosen ? `Continue: ${formatDay(date)}, ${formatTime(chosen.startAt)}` : 'Choose a time first'}
        icon={chosen ? ICONS.forward : undefined}
        disabled={!chosen}
        onPress={() =>
          chosen &&
          router.push({
            pathname: '/patient/doctors/review',
            params: { doctorId, startAt: chosen.startAt, endAt: chosen.endAt },
          })
        }
      />
    </>
  );
}

/** Slot picker: days in a wrapping grid (no sideways scrolling), then that day's free times. */
export default function Slots() {
  const { doctorId } = useLocalSearchParams<{ doctorId: string }>();
  const doctor = useDoctor(doctorId);
  const slots = useSlots(doctorId);
  return (
    <Screen>
      {doctor.data && <AppText color="textMuted">Booking with {doctor.data.name}</AppText>}
      <QueryState
        query={slots}
        loading={<Skeleton cards={2} />}
        isEmpty={(data) => data.days.every((d) => d.slots.length === 0)}
        empty={
          <EmptyState
            icon={ICONS.blocked}
            title="No free times in the next 14 days."
            body="This doctor is fully booked or away. Try another doctor."
            action={{ label: 'Find another doctor', icon: ICONS.search, onPress: () => router.back() }}
          />
        }
      >
        {(data) => <Picker doctorId={doctorId} days={data.days} />}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  day: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: minTouchTarget + 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  daySelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayFull: { opacity: 0.5 },
  center: { textAlign: 'center' },
});
