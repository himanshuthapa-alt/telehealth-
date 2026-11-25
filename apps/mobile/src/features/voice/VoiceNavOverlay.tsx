import { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { navigateIntent, parseVoiceIntent, sayForIntent } from './intents';
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
 * Emergency words ("chest pain", "saans nahi", …) always win: the app does not
 * navigate, it speaks a warning and shows big Call 108 / 112 buttons.
 *
 * ponytail: navigation is fired before (and independently of) the slow CPU TTS,
 * so the UI never blocks waiting on audio.
 */
export function VoiceNavOverlay() {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [emergency, setEmergency] = useState(false);
  const handled = useRef(false);
  const lastTranscript = useRef('');

  const act = useCallback((transcript: string) => {
    if (handled.current) return;
    handled.current = true;
    setHeard(transcript);
    const intent = parseVoiceIntent(transcript);
    const say = sayForIntent(intent);
    setReply(say);

    if (intent.kind === 'emergency') {
      setEmergency(true);
    } else {
      setEmergency(false);
      navigateIntent(intent); // navigate first — never wait on the (slow) TTS
    }

    setStatus('speaking');
    void speak(say)
      .catch(() => {})
      .finally(() => setStatus('idle'));
  }, []);

  useSpeechEvent('result', (e) => {
    const transcript = e.results?.[0]?.transcript ?? '';
    if (transcript) {
      lastTranscript.current = transcript;
      setHeard(transcript);
    }
    if (e.isFinal && transcript) act(transcript);
  });

  // Many Android recognizers stop on silence without ever marking a result
  // `isFinal`. If listening ended and we have a transcript we never acted on,
  // act on it now so the app still responds.
  useSpeechEvent('end', () => {
    if (!handled.current && lastTranscript.current) act(lastTranscript.current);
    setStatus((s) => (s === 'listening' ? 'idle' : s));
  });
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
    lastTranscript.current = '';
    setHeard('');
    setReply('');
    setEmergency(false);
    setStatus('listening');
    speechInput.start({ lang: 'en-IN' });
  }, [status]);

  const showPanel = heard !== '' || reply !== '';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {showPanel && (
        <View style={[styles.panel, emergency && styles.panelEmergency]}>
          {heard !== '' && (
            <AppText variant="caption" color="textMuted">
              You said: “{heard}”
            </AppText>
          )}
          {reply !== '' && (
            <AppText variant="label" color={emergency ? 'danger' : 'text'}>
              {reply}
            </AppText>
          )}
          {emergency && (
            <View style={styles.callRow}>
              <Pressable
                style={styles.callButton}
                accessibilityRole="button"
                accessibilityLabel="Call 108, ambulance"
                onPress={() => Linking.openURL('tel:108')}
              >
                <AppText variant="label" color="onPrimary">
                  Call 108
                </AppText>
              </Pressable>
              <Pressable
                style={styles.callButton}
                accessibilityRole="button"
                accessibilityLabel="Call 112, emergency"
                onPress={() => Linking.openURL('tel:112')}
              >
                <AppText variant="label" color="onPrimary">
                  Call 112
                </AppText>
              </Pressable>
            </View>
          )}
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
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  panelEmergency: {
    borderColor: colors.danger,
    borderWidth: 2,
    backgroundColor: colors.dangerSoft,
  },
  callRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  callButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
