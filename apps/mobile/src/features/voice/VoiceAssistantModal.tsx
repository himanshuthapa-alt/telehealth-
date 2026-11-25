import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ICONS } from '@/features/shell/icons';
import { speak } from './speech-api';
import { AppText, Banner, Button, Icon, TextField, colors, radius, spacing } from '@/ui';

/** Health tips read aloud — useful for low-literacy patients in rural areas. */
const SAMPLE_PHRASES = [
  { label: 'Welcome 🙏', text: 'Namaste, and welcome to TeleCare Plus. How can we help you today?' },
  { label: 'Drink water 💧', text: 'Remember to drink plenty of clean water and rest well.' },
  { label: 'Take medicine 💊', text: 'Please take your medicine on time, as written by your doctor.' },
  { label: 'Book a doctor 👩‍⚕️', text: 'You can book a doctor from the home screen in just a few taps.' },
];

export interface VoiceAssistantModalProps {
  visible: boolean;
  onClose: () => void;
}

export function VoiceAssistantModal({ visible, onClose }: VoiceAssistantModalProps) {
  const [input, setInput] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSpeak = async (textToSpeak?: string) => {
    const text = (textToSpeak ?? input).trim();
    if (!text) return;
    setError(null);
    setSpeaking(true);
    try {
      await speak(text);
    } catch {
      setError('Voice service is offline. Start the Chatterbox TTS service and try again.');
    } finally {
      setSpeaking(false);
    }
  };

  const close = () => {
    setInput('');
    setError(null);
    setSpeaking(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.micBadge}>
                <Icon name={ICONS.mic} size={24} color={colors.primary} />
              </View>
              <View>
                <AppText variant="title">Bolo / बोलो</AppText>
                <AppText color="textMuted">Suno — Read aloud / सुनो</AppText>
              </View>
            </View>
            <Pressable onPress={close} hitSlop={12}>
              <Icon name={ICONS.cancel} size={28} color="textMuted" />
            </Pressable>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              Type something and hear it spoken
            </AppText>
            <AppText color="textMuted" style={{ textAlign: 'center' }}>
              लिखें और आवाज़ में सुनें
            </AppText>

            {error && <Banner tone="danger" message={error} />}

            <TextField
              label="Text to speak / बोलने के लिए लिखें"
              placeholder="e.g. Take your medicine after food"
              value={input}
              onChangeText={setInput}
              returnKeyType="done"
              onSubmitEditing={() => handleSpeak()}
            />

            <Button
              label={speaking ? 'Speaking…' : 'Speak aloud / सुनाएं'}
              icon={ICONS.mic}
              disabled={!input.trim() || speaking}
              onPress={() => handleSpeak()}
            />

            <View style={styles.chipSection}>
              <AppText variant="caption" color="textMuted">
                Or tap a phrase to hear it:
              </AppText>
              <View style={styles.chipRow}>
                {SAMPLE_PHRASES.map((sample) => (
                  <Pressable
                    key={sample.label}
                    style={styles.sampleChip}
                    onPress={() => {
                      setInput(sample.text);
                      void handleSpeak(sample.text);
                    }}
                  >
                    <AppText variant="caption" style={{ fontWeight: '600' }}>
                      {sample.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  micBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.md },
  contentInner: { paddingVertical: spacing.md, gap: spacing.md },
  chipSection: { gap: spacing.xs, marginTop: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sampleChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
