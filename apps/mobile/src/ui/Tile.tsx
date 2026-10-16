import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { colors, minTouchTarget, radius, spacing } from './theme';

export interface TileProps {
  icon: IconName;
  label: string;
  /** Smaller second line, e.g. the medical name under an everyday one. */
  sublabel?: string;
  selected?: boolean;
  onPress: () => void;
}

/**
 * A big choice button: icon, everyday words, optional second line. Laid out
 * in a wrapping grid (see TileGrid), never a sideways-scrolling row.
 */
export function Tile({ icon, label, sublabel, selected = false, onPress }: TileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.selected,
        pressed && !selected && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, selected && { backgroundColor: colors.surface }]}>
        <Icon name={icon} size={30} color="primary" />
      </View>
      <AppText variant="label" style={styles.center}>
        {label}
      </AppText>
      {sublabel && (
        <AppText variant="caption" color="textMuted" style={styles.center}>
          {sublabel}
        </AppText>
      )}
    </Pressable>
  );
}

/** Two tiles per row, wrapping. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: minTouchTarget * 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.surface,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { borderColor: colors.primary },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
