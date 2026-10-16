import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from './theme';

/** Grey placeholder cards shown while content loads (blueprint §18: skeletons, not spinners). */
export function Skeleton({ cards = 3 }: { cards?: number }) {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ gap: spacing.md }}>
      {Array.from({ length: cards }, (_, i) => (
        <View key={i} style={styles.card}>
          <View style={[styles.line, { width: '55%', height: 20 }]} />
          <View style={[styles.line, { width: '90%' }]} />
          <View style={[styles.line, { width: '70%' }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  line: { height: 14, borderRadius: radius.sm, backgroundColor: colors.border },
});
