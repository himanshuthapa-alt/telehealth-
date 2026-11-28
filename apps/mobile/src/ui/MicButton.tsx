import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { AppText } from './AppText';
import { Icon, icon } from './Icon';
import { colors, radius, spacing } from './theme';

const MIC = icon('mic', 'mic.fill');

export type MicStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface MicButtonProps {
  status: MicStatus;
  onPress: () => void;
  /** Optional short word shown under the mic (defaults per status). */
  label?: string;
}

// Per-status look + spoken accessibility label. Kept here so every caller is consistent.
const LOOK: Record<MicStatus, { bg: keyof typeof colors; word: string; a11y: string }> = {
  idle: { bg: 'primary', word: 'Tap to speak', a11y: 'Voice navigation. Tap and speak a command.' },
  listening: { bg: 'danger', word: 'Listening…', a11y: 'Listening. Speak now, then tap again to stop.' },
  thinking: { bg: 'primaryPressed', word: 'Thinking…', a11y: 'Working on what you said.' },
  speaking: { bg: 'success', word: 'Speaking…', a11y: 'Speaking the answer.' },
};

/**
 * Large, high-contrast voice button for low-literacy users: one icon, one word,
 * a 72dp tap target, a pulse while listening, and a short buzz on press so the
 * user knows the tap registered without reading anything.
 */
export function MicButton({ status, onPress, label }: MicButtonProps) {
  const look = LOOK[status];
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (status !== 'listening') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Pressable
          onPress={() => {
            Vibration.vibrate(15);
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={look.a11y}
          accessibilityState={{ busy: status === 'thinking' || status === 'speaking' }}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors[look.bg] },
            pressed && styles.pressed,
          ]}
        >
          <Icon name={MIC} size={34} color="onPrimary" />
        </Pressable>
      </Animated.View>
      <AppText variant="caption" color="text" style={styles.label}>
        {label ?? look.word}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs },
  button: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pressed: { opacity: 0.85 },
  label: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
    fontWeight: '700',
  },
});
