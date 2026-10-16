import { StyleSheet, View } from 'react-native';
import { FREQUENCIES, type PrescriptionItem, type TimeOfDay } from '@telecare/shared';
import { AppText, Card, Icon, colors, radius, spacing, type IconName } from '@/ui';

const TIME: Record<TimeOfDay, { label: string; icon: IconName }> = {
  morning: { label: 'Morning', icon: { android: 'wb_sunny', ios: 'sunrise' } },
  afternoon: { label: 'Afternoon', icon: { android: 'light_mode', ios: 'sun.max' } },
  evening: { label: 'Evening', icon: { android: 'wb_twilight', ios: 'sunset' } },
  night: { label: 'Night', icon: { android: 'bedtime', ios: 'moon' } },
};

/** When to take it, as pictures and words: sun for morning, moon for night. */
export function TimesOfDay({ frequency }: { frequency: PrescriptionItem['frequency'] }) {
  const f = FREQUENCIES[frequency];
  if (f.times.length === 0)
    return (
      <AppText variant="label" color="primary">
        {f.label}
      </AppText>
    );
  return (
    <View
      style={styles.times}
      accessible
      accessibilityLabel={`${f.label}: ${f.times.map((t) => TIME[t].label).join(', ')}`}
    >
      {f.times.map((t) => (
        <View key={t} style={styles.time}>
          <Icon name={TIME[t].icon} size={30} color="primary" />
          <AppText variant="caption" style={{ fontWeight: '700' }}>
            {TIME[t].label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText color="textMuted" style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant="label" style={{ flex: 1 }}>
        {value}
      </AppText>
    </View>
  );
}

/** One medicine on a prescription, written for someone who reads slowly. */
export function MedicineDose({ item, index }: { item: PrescriptionItem; index: number }) {
  return (
    <Card>
      <View style={styles.title}>
        <View style={styles.number}>
          <AppText variant="label" color="onAccent">
            {index + 1}
          </AppText>
        </View>
        <AppText variant="heading" style={{ flex: 1 }}>
          {item.medicineName}
        </AppText>
      </View>
      <Row label="How much" value={item.dosage} />
      <View style={styles.row}>
        <AppText color="textMuted" style={styles.rowLabel}>
          When
        </AppText>
        <View style={{ flex: 1 }}>
          <TimesOfDay frequency={item.frequency} />
        </View>
      </View>
      <Row label="For" value={item.durationDays === 1 ? '1 day' : `${item.durationDays} days`} />
      {item.instructions && <Row label="Note" value={item.instructions} />}
      {!item.inCatalog && (
        <AppText variant="small" color="warning">
          Not sold by the TeleCare+ pharmacy. Buy it from a local chemist.
        </AppText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  number: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { width: 92 },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  time: { alignItems: 'center', minWidth: 64 },
});
