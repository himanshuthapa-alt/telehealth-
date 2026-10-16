import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, spacing } from './theme';

export interface TokenProps {
  /** Big line, e.g. "Today" */
  day: string;
  /** Biggest line, e.g. "11:30 AM" */
  time: string;
  /** Who it's with */
  who: string;
  /** Under the tear line: what happens next */
  note?: string;
  /** Read out in full by screen readers. */
  accessibilityLabel: string;
}

/**
 * The appointment, drawn like the paper OPD token people get at an Indian
 * hospital counter: marigold slip, the time in large print, a torn-off line.
 * The one bold element in the app; everything around it stays quiet.
 */
export function Token({ day, time, who, note, accessibilityLabel }: TokenProps) {
  return (
    <View style={styles.slip} accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.top}>
        <AppText variant="label" color="onAccent">
          {day}
        </AppText>
        <AppText style={styles.time} color="onAccent">
          {time}
        </AppText>
        <AppText variant="label" color="onAccent">
          {who}
        </AppText>
      </View>
      {note && (
        <>
          <View style={styles.tear}>
            <View style={[styles.notch, styles.notchLeft]} />
            <View style={styles.dashes} />
            <View style={[styles.notch, styles.notchRight]} />
          </View>
          <AppText color="onAccent" style={styles.note}>
            {note}
          </AppText>
        </>
      )}
    </View>
  );
}

const NOTCH = 22;
const styles = StyleSheet.create({
  slip: { backgroundColor: colors.accent, borderRadius: radius.lg, overflow: 'hidden' },
  top: { padding: spacing.lg, paddingBottom: spacing.md, gap: 2 },
  time: { fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: -0.5 },
  tear: { height: NOTCH, justifyContent: 'center' },
  dashes: {
    marginHorizontal: NOTCH,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.onAccent,
    opacity: 0.45,
  },
  notch: {
    position: 'absolute',
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: colors.background,
  },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  note: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    fontWeight: '600',
  },
});
