import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, minTouchTarget, radius, spacing } from './theme';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name (plain text). */
  label: string;
  /** Optional richer content shown instead of the plain label. */
  children?: ReactNode;
  error?: string;
}

export function Checkbox({ checked, onChange, label, children, error }: CheckboxProps) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.checked, error ? styles.boxError : null]}>
          {checked && (
            <AppText variant="label" color="onPrimary">
              ✓
            </AppText>
          )}
        </View>
        <View style={{ flex: 1 }}>{children ?? <AppText>{label}</AppText>}</View>
      </Pressable>
      {error && (
        <AppText variant="small" color="danger">
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: minTouchTarget },
  box: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: colors.primary },
  boxError: { borderColor: colors.danger },
});
