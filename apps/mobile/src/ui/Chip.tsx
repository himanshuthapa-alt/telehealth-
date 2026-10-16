import { Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { colors, minTouchTarget, radius, spacing } from './theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Share a row evenly with its neighbours (for grids of equal choices, like times). */
  even?: boolean;
}

/** A small choice. Selected = marigold fill plus a tick, so it doesn't rely on colour alone. */
export function Chip({ label, selected = false, onPress, even = false }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && !selected && styles.pressed,
      ]}
    >
      {selected && <Icon name={{ android: 'check', ios: 'checkmark' }} size={20} color="onAccent" />}
      <AppText variant="label" color={selected ? 'onAccent' : 'primary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: minTouchTarget - 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  even: { flexBasis: '30%', flexGrow: 1, justifyContent: 'center' },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { borderColor: colors.primary },
});
