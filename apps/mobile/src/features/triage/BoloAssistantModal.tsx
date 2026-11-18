import { useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import {
  SPOKEN_DISCLAIMER_HI,
  TRIAGE_DISCLAIMER,
  type TriageResult,
} from '@telecare/shared';
import { ICONS } from '@/features/shell/icons';
import { SPECIALTY } from '@/features/doctors/specialties';
import { triageSymptoms } from './triage-api';
import {
  AppText,
  Banner,
  Button,
  Card,
  Icon,
  TextField,
  colors,
  radius,
  spacing,
} from '@/ui';

const SAMPLE_SYMPTOMS = [
  { label: 'Chest pain & sweating 🚨', text: 'Severe chest pain and sweating' },
  { label: '2-year child fever 👶', text: 'Baby has high fever and is crying' },
  { label: 'Red itchy skin rash 🩹', text: 'Itchy red rash on skin with small bumps' },
  { label: 'Ear & throat pain 👂', text: 'Severe earache and throat pain' },
  { label: 'Knee joint pain 🦵', text: 'Knee joint pain when walking' },
  { label: 'Fever & cold 2 days 🌡️', text: 'Fever and body ache for past 2 days' },
  { label: 'Hindi: छाती में तेज दर्द 🚨', text: 'chaati me tez dard aur paseena' },
  { label: 'Garhwali: छाती पीड़ा 🚨', text: 'chhati peeda bhot tezi se' },
];

export interface BoloAssistantModalProps {
  visible: boolean;
  onClose: () => void;
}

export function BoloAssistantModal({ visible, onClose }: BoloAssistantModalProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [isListening, setIsListening] = useState(false);

  const handleTriage = async (textToTriage?: string) => {
    const text = (textToTriage ?? input).trim();
    if (!text) return;
    setLoading(true);
    try {
      const res = await triageSymptoms({ symptoms: text });
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateVoice = (sampleText: string) => {
    setInput(sampleText);
    void handleTriage(sampleText);
  };

  const toggleMic = () => {
    if (isListening) {
      setIsListening(false);
      if (input.trim()) void handleTriage();
    } else {
      setIsListening(true);
      // Simulate listening state
      setTimeout(() => {
        setIsListening(false);
        if (!input.trim()) {
          setInput('Fever, headache and cough for past 2 days');
          void handleTriage('Fever, headache and cough for past 2 days');
        } else {
          void handleTriage();
        }
      }, 1500);
    }
  };

  const reset = () => {
    setInput('');
    setResult(null);
    setIsListening(false);
  };

  const callNumber = (phone: string) => {
    void Linking.openURL(`tel:${phone}`);
  };

  const goToDoctors = (specialization: string) => {
    onClose();
    reset();
    router.navigate({
      pathname: '/patient/doctors',
      params: { specialization },
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.micBadge}>
                <Icon name={ICONS.mic} size={24} color={colors.primary} />
              </View>
              <View>
                <AppText variant="title">Bolo / बोलो</AppText>
                <AppText color="textMuted">Voice & Symptom Triage</AppText>
              </View>
            </View>
            <Pressable
              onPress={() => {
                onClose();
                reset();
              }}
              hitSlop={12}
            >
              <Icon name={ICONS.cancel} size={28} color="textMuted" />
            </Pressable>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
            {/* Disclaimer pill */}
            <Banner tone="info" message={SPOKEN_DISCLAIMER_HI} />
            <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {TRIAGE_DISCLAIMER}
            </AppText>

            {/* If no result yet: Input and Voice prompt */}
            {!result && (
              <View style={styles.inputSection}>
                <AppText variant="heading" style={{ textAlign: 'center' }}>
                  अपनी परेशानी बताएं / Speak your problem
                </AppText>
                <AppText color="textMuted" style={{ textAlign: 'center' }}>
                  Hindi, Hinglish, English, or Garhwali
                </AppText>

                {/* Big Mic Button */}
                <View style={styles.micContainer}>
                  <Pressable
                    style={[styles.bigMicButton, isListening && styles.bigMicActive]}
                    onPress={toggleMic}
                  >
                    <Icon name={ICONS.mic} size={48} color={isListening ? colors.accent : colors.surface} />
                  </Pressable>
                  <AppText variant="label" color={isListening ? 'accent' : 'text'}>
                    {isListening ? 'Listening… / सुन रहे हैं…' : 'Tap to Speak / बोलें'}
                  </AppText>
                </View>

                {/* Text fallback / manual input */}
                <TextField
                  label="Or type symptoms / या लिखकर बताएं"
                  placeholder="e.g. fever, knee pain, skin rash..."
                  value={input}
                  onChangeText={setInput}
                  returnKeyType="done"
                  onSubmitEditing={() => handleTriage()}
                />

                <Button
                  label={loading ? 'Checking…' : 'Find Doctor by Symptoms'}
                  icon={ICONS.search}
                  disabled={!input.trim() || loading}
                  onPress={() => handleTriage()}
                />

                {/* Quick test chips */}
                <View style={styles.chipSection}>
                  <AppText variant="caption" color="textMuted">
                    Quick test symptoms (Try any problem):
                  </AppText>
                  <View style={styles.chipRow}>
                    {SAMPLE_SYMPTOMS.map((sample) => (
                      <Pressable
                        key={sample.label}
                        style={styles.sampleChip}
                        onPress={() => handleSimulateVoice(sample.text)}
                      >
                        <AppText variant="caption" style={{ fontWeight: '600' }}>
                          {sample.label}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Emergency Lane Alert */}
            {result && result.urgency === 'EMERGENCY' && (
              <Card style={styles.emergencyCard}>
                <View style={styles.emergencyHeader}>
                  <Icon name={ICONS.warning} size={32} color={colors.danger} />
                  <AppText variant="heading" color="danger">
                    EMERGENCY / आपातकालीन चेतावनी
                  </AppText>
                </View>
                <AppText style={styles.emergencyNotice}>
                  Your symptoms suggest a severe medical emergency. Do not wait for an online
                  appointment. Contact emergency services or reach the nearest hospital immediately.
                </AppText>
                <AppText color="textMuted" style={{ fontStyle: 'italic' }}>
                  {result.summary}
                </AppText>

                <View style={styles.emergencyButtons}>
                  <Button
                    label="Call 112 (National Emergency)"
                    icon={ICONS.phone}
                    variant="danger"
                    onPress={() => callNumber('112')}
                  />
                  <Button
                    label="Call 108 (Ambulance Service)"
                    icon={ICONS.phone}
                    variant="secondary"
                    onPress={() => callNumber('108')}
                  />
                </View>

                <Button label="Try another problem" variant="secondary" onPress={reset} />
              </Card>
            )}

            {/* Routine / Urgent Recommendation Result */}
            {result && result.urgency !== 'EMERGENCY' && (
              <Card style={styles.resultCard}>
                <View style={styles.urgencyBadge}>
                  <AppText
                    variant="caption"
                    style={[
                      styles.urgencyText,
                      result.urgency === 'URGENT' ? styles.urgentTag : styles.routineTag,
                    ]}
                  >
                    {result.urgency === 'URGENT' ? 'PRIORITY / URGENT ATTENTION' : 'ROUTINE CONSULTATION'}
                  </AppText>
                </View>

                <AppText variant="title">
                  Recommended: {SPECIALTY[result.recommendedSpecialization]?.plain ?? result.recommendedSpecialization}
                </AppText>
                <AppText color="textMuted">Specialty: {result.recommendedSpecialization}</AppText>

                <View style={styles.summaryBox}>
                  <AppText variant="caption" color="textMuted">
                    AI Symptom Assessment:
                  </AppText>
                  <AppText>{result.summary}</AppText>
                </View>

                <Banner tone="info" message={result.disclaimer} />

                <View style={styles.actionRow}>
                  <Button
                    label={`Yes, show ${SPECIALTY[result.recommendedSpecialization]?.plain ?? 'Doctors'}`}
                    icon={ICONS.doctor}
                    onPress={() => goToDoctors(result.recommendedSpecialization)}
                  />
                  <Button label="No, try again" variant="secondary" onPress={reset} />
                </View>
              </Card>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  micBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  contentInner: {
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  inputSection: {
    gap: spacing.md,
    alignItems: 'stretch',
  },
  micContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  bigMicButton: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  bigMicActive: {
    backgroundColor: colors.primaryPressed,
    transform: [{ scale: 1.08 }],
  },
  chipSection: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  sampleChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emergencyCard: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 2,
    gap: spacing.md,
  },
  emergencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emergencyNotice: {
    fontWeight: '700',
    color: colors.danger,
  },
  emergencyButtons: {
    gap: spacing.sm,
  },
  resultCard: {
    gap: spacing.md,
    borderColor: colors.accent,
    borderWidth: 2,
  },
  urgencyBadge: {
    alignSelf: 'flex-start',
  },
  urgencyText: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    fontWeight: '800',
    overflow: 'hidden',
  },
  urgentTag: {
    backgroundColor: colors.warningSoft,
    color: colors.warning,
  },
  routineTag: {
    backgroundColor: colors.successSoft,
    color: colors.success,
  },
  summaryBox: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.sm,
    gap: 4,
  },
  actionRow: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
