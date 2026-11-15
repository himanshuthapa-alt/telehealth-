import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { Icon, colors, radius } from '@/ui';
import { ICONS } from '@/features/shell/icons';

const SIZE = 132;

export interface MicButtonProps {
  /** Called with the recorded clip's file uri when the user finishes speaking. */
  onClip: (uri: string) => void;
  /** Called when the mic can't be used (permission denied, or not available). */
  onUnavailable: (reason: string) => void;
  /** Disable while a previous turn is still being processed. */
  busy?: boolean;
}

/**
 * The big "Bolo / बोलिए" button. Tap to start recording, tap again to stop and
 * send. Falls back via `onUnavailable` when the mic is denied, so the screen can
 * offer typing instead.
 */
export function MicButton({ onClip, onUnavailable, busy = false }: MicButtonProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!recording) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulse]);

  async function start() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onUnavailable('माइक की अनुमति नहीं मिली। कृपया लिखकर बताइए।');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch {
      onUnavailable('इस फ़ोन पर माइक उपलब्ध नहीं है। कृपया लिखकर बताइए।');
    }
  }

  async function stop() {
    setRecording(false);
    try {
      await recorder.stop();
      if (recorder.uri) onClip(recorder.uri);
      else onUnavailable('रिकॉर्डिंग नहीं हुई। फिर कोशिश करें या लिखें।');
    } catch {
      onUnavailable('रिकॉर्डिंग नहीं हुई। फिर कोशिश करें या लिखें।');
    }
  }

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.5] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.wrap}>
      {recording && (
        <Animated.View style={[styles.pulse, { transform: [{ scale }], opacity }]} pointerEvents="none" />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={recording ? 'बोलना बंद करें' : 'बोलने के लिए दबाएँ'}
        accessibilityState={{ busy, selected: recording }}
        disabled={busy}
        onPress={recording ? stop : start}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: recording ? colors.danger : colors.primary },
          pressed && { opacity: 0.85 },
          busy && { opacity: 0.6 },
        ]}
      >
        <Icon name={recording ? ICONS.stop : ICONS.mic} size={52} color="onPrimary" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  btn: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
});
