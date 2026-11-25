import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { parseVoiceCommand } from './intents';
import { speak } from './speech-api';
import { normalizeSpeechError, speechInput, useSpeechEvent } from './speech-input';
import { AppText, MicButton, colors, radius, spacing, type MicStatus } from '@/ui';

const ERROR_SAY: Record<ReturnType<typeof normalizeSpeechError>, string> = {
  'no-permission': 'Microphone permission is needed for voice.',
  'no-network': 'No internet. Please check your connection.',
  'no-speech': "I didn't hear anything. Please try again.",
  unavailable: 'Voice input is unavailable.',
};

/**
 * Always-on voice navigation for non-technical users: tap the mic, speak a
 * command ("find a doctor", "medicines", "child doctor", "go back"), and the
 * app navigates immediately while Chatterbox speaks a confirmation.
 *
 * ponytail: navigation is fired before (and independently of) the slow CPU TTS,
 * so the UI never blocks waiting on audio.
 */
export function VoiceNavOverlay() {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const handled = useRef(false);

  const act = useCallback((transcript: string) => {
    if (handled.current) return;
    handled.current = true;
    setHeard(transcript);
    const action = parseVoiceCommand(transcript);
    setReply(action.say);

    // Navigate first — never wait on the (slow) TTS.
    switch (action.kind) {
      case 'navigate':
        router.navigate(action.path as never);
        break;
      case 'specialty':
        router.navigate({
          pathname: '/patient/doctors',
          params: { specialization: action.specialization },
        } as never);
        break;
      case 'back':
        router.back();
        break;
      case 'help':
      case 'unknown':
        break;
    }

    // Speak the confirmation via Chatterbox (fire-and-forget; may lag on CPU).
    setStatus('speaking');
    void speak(action.say)
      .catch(() => {})
      .finally(() => setStatus('idle'));
  }, []);

  useSpeechEvent('result', (e) => {
    const transcript = e.results?.[0]?.transcript ?? '';
    if (e.isFinal && transcript) act(transcript);
    else if (transcript) setHeard(transcript);
  });

  useSpeechEvent('end', () => setStatus((s) => (s === 'listening' ? 'idle' : s)));
  useSpeechEvent('nomatch', () => {
    setReply("I didn't catch that. Please try again.");
    setStatus('idle');
  });
  useSpeechEvent('error', (e) => {
    setReply(ERROR_SAY[normalizeSpeechError(e.error)]);
    setStatus('idle');
  });

  const startListening = useCallback(async () => {
    if (status === 'listening') {
      speechInput.stop();
      return;
    }
    const granted = await speechInput.requestPermission();
    if (!granted) {
      setReply(ERROR_SAY['no-permission']);
      return;
    }
    handled.current = false;
    setHeard('');
    setReply('');
    setStatus('listening');
    speechInput.start({ lang: 'en-IN' });
  }, [status]);

  const showPanel = heard !== '' || reply !== '';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {showPanel && (
        <View style={styles.panel} pointerEvents="none">
          {heard !== '' && (
            <AppText variant="caption" color="textMuted">
              You said: “{heard}”
            </AppText>
          )}
          {reply !== '' && <AppText variant="label">{reply}</AppText>}
        </View>
      )}

      <MicButton status={status} onPress={startListening} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: spacing.md,
    bottom: 96, // clear the tab bar
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  panel: {
    maxWidth: 300,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
});
