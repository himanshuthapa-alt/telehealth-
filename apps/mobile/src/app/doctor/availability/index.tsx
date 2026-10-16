import { useState } from 'react';
import { ICONS } from '@/features/shell/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { SLOT_MINUTES_OPTIONS, addDays, istDate, type Availability } from '@telecare/shared';
import { formatDay } from '@/features/appointments/format';
import { toDay } from '@/features/account/format';
import { useAvailability, useAvailabilityMutations } from '@/features/availability/availability-queries';
import { BLOCKS, WEEKDAYS, blocksFromRules, cell, rulesFromBlocks } from '@/features/availability/blocks';
import { errorMessage } from '@/lib/errors';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  QueryState,
  Screen,
  colors,
  minTouchTarget,
  radius,
  spacing,
} from '@/ui';

function WeeklyHours({ availability }: { availability: Availability }) {
  const initial = blocksFromRules(availability.rules);
  const [chosen, setChosen] = useState<Set<string>>(initial.chosen);
  const [slotMinutes, setSlotMinutes] = useState(initial.slotMinutes);
  const [saved, setSaved] = useState(false);
  const { saveRules } = useAvailabilityMutations();

  const toggle = (key: string) => {
    setSaved(false);
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card>
      <AppText variant="heading">Weekly hours</AppText>
      {initial.custom.length > 0 && (
        <Banner
          tone="warning"
          message={`You also have hours set another way (${initial.custom
            .map((r) => `${WEEKDAYS[r.weekday - 1]} ${r.startTime}–${r.endTime}`)
            .join(', ')}). Saving here replaces them with the blocks below.`}
        />
      )}
      <View style={styles.headerRow}>
        <View style={styles.dayCol} />
        {BLOCKS.map((b) => (
          <AppText key={b.key} variant="caption" color="textMuted" style={styles.blockCol}>
            {b.label}
            {'\n'}
            {b.startTime}–{b.endTime}
          </AppText>
        ))}
      </View>
      {WEEKDAYS.map((day, i) => (
        <View key={day} style={styles.dayRow}>
          <AppText variant="label" style={styles.dayCol}>
            {day}
          </AppText>
          {BLOCKS.map((b) => {
            const key = cell(i + 1, b.key);
            const on = chosen.has(key);
            return (
              <Pressable
                key={b.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${day} ${b.label}`}
                onPress={() => toggle(key)}
                style={[styles.box, styles.blockCol, on && styles.boxOn]}
              >
                <AppText variant="label" color={on ? 'onPrimary' : 'textDisabled'}>
                  {on ? '✓' : '–'}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
      <AppText variant="label">Consultation length</AppText>
      <View style={styles.wrap}>
        {SLOT_MINUTES_OPTIONS.map((m) => (
          <Chip
            key={m}
            label={`${m} min`}
            selected={slotMinutes === m}
            onPress={() => {
              setSaved(false);
              setSlotMinutes(m);
            }}
          />
        ))}
      </View>
      {saveRules.error && <Banner tone="danger" message={errorMessage(saveRules.error)} />}
      {saved && <Banner tone="success" message="Hours saved. Existing bookings are kept." />}
      <Button
        label="Save hours"
        loading={saveRules.isPending}
        onPress={() =>
          saveRules.mutate(rulesFromBlocks(chosen, slotMinutes), { onSuccess: () => setSaved(true) })
        }
      />
    </Card>
  );
}

function BlockedDays({ availability }: { availability: Availability }) {
  const [picking, setPicking] = useState(false);
  const [warning, setWarning] = useState<string>();
  const { block, unblock } = useAvailabilityMutations();
  const today = istDate(new Date());

  return (
    <Card>
      <AppText variant="heading">Days off</AppText>
      <AppText variant="small" color="textMuted">
        {
          "Patients can't book on these days. Appointments already booked stay; cancel them from Appointments if needed."
        }
      </AppText>
      {availability.exceptions.length === 0 && <AppText color="textMuted">No days off planned.</AppText>}
      {availability.exceptions.map((e) => (
        <View key={e.date} style={styles.blockedRow}>
          <AppText>{formatDay(e.date)}</AppText>
          <Button label="Remove" variant="ghost" icon={ICONS.cancel} onPress={() => unblock.mutate(e.date)} />
        </View>
      ))}
      {warning && <Banner tone="warning" message={warning} />}
      {(block.error || unblock.error) && (
        <Banner tone="danger" message={errorMessage(block.error ?? unblock.error)} />
      )}
      <Button
        label="Add a day off"
        variant="secondary"
        loading={block.isPending}
        onPress={() => setPicking(true)}
      />
      {picking && (
        <DateTimePicker
          value={new Date()}
          minimumDate={new Date()}
          maximumDate={new Date(`${addDays(today, 365)}T00:00:00`)}
          accentColor={colors.primary}
          onValueChange={(_e, date) => {
            setPicking(false);
            setWarning(undefined);
            block.mutate(toDay(date), {
              onSuccess: ({ bookedThatDay }) =>
                bookedThatDay > 0 &&
                setWarning(
                  `You have ${bookedThatDay} appointment${bookedThatDay > 1 ? 's' : ''} that day. They are not cancelled automatically.`,
                ),
            });
          }}
          onDismiss={() => setPicking(false)}
        />
      )}
    </Card>
  );
}

export default function AvailabilityScreen() {
  const availability = useAvailability();
  return (
    <Screen>
      <QueryState query={availability}>
        {(data) => (
          <>
            <WeeklyHours availability={data} />
            <BlockedDays availability={data} />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dayCol: { width: 44 },
  blockCol: { flex: 1, textAlign: 'center' },
  box: {
    minHeight: minTouchTarget,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  blockedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
