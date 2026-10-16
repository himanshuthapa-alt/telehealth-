import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon, icon } from './Icon';
import { colors, radius, spacing } from './theme';

type Tone = 'info' | 'success' | 'warning' | 'danger';
const BG = {
  info: 'infoSoft',
  success: 'successSoft',
  warning: 'warningSoft',
  danger: 'dangerSoft',
} as const;
const ICON = {
  info: icon('info', 'info.circle'),
  success: icon('check_circle', 'checkmark.circle'),
  warning: icon('warning', 'exclamationmark.triangle'),
  danger: icon('error', 'exclamationmark.octagon'),
} as const;

/** A message box for errors and notices: icon + words + colour, never colour alone. */
export function Banner({ tone = 'info', message }: { tone?: Tone; message: string }) {
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: colors[BG[tone]], borderColor: colors[tone] }]}
    >
      <Icon name={ICON[tone]} size={26} color={tone} />
      <AppText color={tone} style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderLeftWidth: 5,
    padding: spacing.md,
  },
  text: { flex: 1, fontWeight: '600' },
});
