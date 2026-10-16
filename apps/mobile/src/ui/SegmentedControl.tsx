import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, minTouchTarget, radius, spacing } from './theme';

export interface SegmentedControlProps<T extends string> {
  segments: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Switches between views of one screen, e.g. Upcoming / Past. Wraps onto two rows if the words don't fit. */
export function SegmentedControl<T extends string>({ segments, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View accessibilityRole="tablist" style={styles.bar}>
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.value)}
            style={[styles.segment, selected && styles.selected]}
          >
            <AppText
              variant="label"
              color={selected ? 'onPrimary' : 'primary'}
              style={{ textAlign: 'center' }}
            >
              {segment.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segment: {
    flexGrow: 1,
    minHeight: minTouchTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  selected: { backgroundColor: colors.primary },
});
