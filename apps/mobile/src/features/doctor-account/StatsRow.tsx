import { StyleSheet, View } from 'react-native';
import { AppText, Card, spacing } from '@/ui';
import { useDoctorStats } from './queries';

/** Four numbers at the top of the doctor's Today tab. Hidden until loaded, so it never blocks the list. */
export function StatsRow() {
  const { data } = useDoctorStats();
  if (!data) return null;
  const tiles = [
    { label: 'Today', value: String(data.today) },
    { label: 'Upcoming', value: String(data.upcoming) },
    { label: 'Completed', value: String(data.completed) },
    { label: 'Earned', value: `₹${data.earningsInr.toLocaleString('en-IN')}` },
  ];
  return (
    <View style={styles.row}>
      {tiles.map((t) => (
        <Card key={t.label} style={styles.tile} accessible accessibilityLabel={`${t.label}: ${t.value}`}>
          <AppText variant="heading">{t.value}</AppText>
          <AppText variant="caption" color="textMuted">
            {t.label}
          </AppText>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%', gap: 0 },
});
