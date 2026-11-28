import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { colors, minTouchTarget, primaryActionHeight, radius, spacing } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  /** An icon that says the same as the label, for people who read slowly. */
  icon?: IconName;
}

const TEXT = { primary: 'onPrimary', secondary: 'primary', ghost: 'primary', danger: 'danger' } as const;

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  icon,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed &&
          (variant === 'primary'
            ? { backgroundColor: colors.primaryPressed }
            : { backgroundColor: colors.primarySoft }),
        inactive && styles.inactive,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon && <Icon name={icon} size={22} color={TEXT[variant]} />}
          <AppText variant="label" color={TEXT[variant]} style={styles.text}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { textAlign: 'center', flexShrink: 1 },
  primary: { backgroundColor: colors.primary, minHeight: primaryActionHeight },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.danger },
  // Disabled stays readable (not faded to grey-on-grey): a lighter fill, same text.
  inactive: { opacity: 0.55 },
});
