import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { SPOKEN_DISCLAIMER_HI, TRIAGE_DISCLAIMER, type TriageResult } from '@telecare/shared';
import { ICONS } from '@/features/shell/icons';
import { SPECIALTY } from '@/features/doctors/specialties';
import { transcribeAudio, triageSymptoms } from './triage-api';
import {
  resolveVoiceLanguage,
  savedVoiceLanguage,
  VOICE_LANGUAGES,
  type VoiceLanguage,
} from './voice-language';
import { speakWithFallback } from './speech-output';
import { activeUrgentRequestKey, cancelUrgentRequest, createUrgentRequest } from './urgent-api';
import { useUrgentRequest } from './urgent-queries';
import { AppText, Banner, Button, Card, Icon, TextField, colors, radius, spacing } from '@/ui';

const VOICE_LANGUAGE_KEY = 'telecare.voice-language';

const SAMPLE_SYMPTOMS = [
  { label: 'Chest pain and sweating', text: 'Severe chest pain and sweating' },
  { label: 'Child with fever', text: 'Baby has high fever and is crying' },
  { label: 'Itchy skin rash', text: 'Itchy red rash on skin with small bumps' },
  { label: 'Ear and throat pain', text: 'Severe earache and throat pain' },
  { label: 'Knee joint pain', text: 'Knee joint pain when walking' },
  { label: 'Fever and cold', text: 'Fever and body ache for past 2 days' },
  { label: 'Hinglish example', text: 'chaati me tez dard aur paseena' },
  { label: 'Garhwali example', text: 'chhati peeda bhot tezi se' },
];

export interface BoloAssistantModalProps {
  patientId: string;
  visible: boolean;
  onClose: () => void;
}

export function BoloAssistantModal({ patientId, visible, onClose }: BoloAssistantModalProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [savedLanguage, setSavedLanguage] = useState<VoiceLanguage | null>(null);
  const [responseLanguage, setResponseLanguage] = useState<VoiceLanguage | null>(null);
  const [askLanguage, setAskLanguage] = useState(false);
  const [urgentRequestId, setUrgentRequestId] = useState<string | null>(null);
  const [urgentRequestKey, setUrgentRequestKey] = useState<string | null>(null);
  const [urgentRequestReason, setUrgentRequestReason] = useState<string | null>(null);
  const [requestingDoctor, setRequestingDoctor] = useState(false);
  const urgentRequestQuery = useUrgentRequest(urgentRequestId, visible);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void AsyncStorage.getItem(VOICE_LANGUAGE_KEY).then((value) => {
      if (!active) return;
      const language = value ? (VOICE_LANGUAGES.find((item) => item.id === value)?.id ?? null) : null;
      setSavedLanguage(language);
      setResponseLanguage(language);
    });
    void speakWithFallback(SPOKEN_DISCLAIMER_HI, 'hindi');
    return () => {
      active = false;
      Speech.stop();
    };
  }, [visible]);

  const speakResult = (triage: TriageResult, language: VoiceLanguage | null) => {
    const message =
      triage.urgency === 'EMERGENCY'
        ? language === 'english'
          ? 'This may be an emergency. Call 112 or 108 now. Do not wait for an online appointment.'
          : 'यह आपात स्थिति हो सकती है। अभी 112 या 108 पर कॉल करें। ऑनलाइन अपॉइंटमेंट का इंतज़ार न करें।'
        : language === 'english'
          ? `Suggestion: ${SPECIALTY[triage.recommendedSpecialization]?.plain ?? triage.recommendedSpecialization}. This is not a diagnosis. Say yes to see doctors.`
          : `सुझाव: ${SPECIALTY[triage.recommendedSpecialization]?.plain ?? triage.recommendedSpecialization}. यह निदान नहीं है। डॉक्टर देखने के लिए हाँ कहें।`;
    Speech.stop();
    void speakWithFallback(message, language ?? 'hindi');
  };

  const saveVoiceLanguage = (language: VoiceLanguage) => {
    setSavedLanguage(language);
    setResponseLanguage(language);
    setAskLanguage(false);
    void AsyncStorage.setItem(VOICE_LANGUAGE_KEY, language);
    if (result) speakResult(result, language);
  };

  const handleTriage = async (textToTriage?: string) => {
    const text = (textToTriage ?? input).trim();
    if (!text) return;
    setInput(text);
    setUrgentRequestId(null);
    setUrgentRequestKey(null);
    setUrgentRequestReason(null);
    setLoading(true);
    setVoiceError(null);
    try {
      const res = await triageSymptoms({ symptoms: text });
      setResult(res);
      setResponseLanguage(savedLanguage);
      if (res.urgency === 'EMERGENCY') speakResult(res, savedLanguage);
    } catch {
      setVoiceError(
        'We could not check those symptoms right now. Please try again or contact emergency services if this may be urgent.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceReply = (spoken: string) => {
    const answer = spoken.toLowerCase().trim();
    if (/^(yes|yeah|yep|haan|han|ji|हाँ|हां|जी)(\b|\s|$)/u.test(answer)) {
      goToDoctors(result?.recommendedSpecialization ?? 'General Physician');
    } else if (/^(no|nope|nahi|nahin|नहीं|ना)(\b|\s|$)/u.test(answer)) {
      reset();
    } else {
      setVoiceError('I did not hear yes or no clearly. Please try again, or use the buttons below.');
    }
  };

  const handleTranscription = async (uri: string) => {
    setLoading(true);
    setVoiceError(null);
    try {
      const transcription = await transcribeAudio(uri);
      setInput(transcription.text);
      if (result) {
        const spokenTriage = await triageSymptoms({
          symptoms: transcription.text,
          language: transcription.language ?? undefined,
        });
        const storedLanguage =
          savedLanguage ?? savedVoiceLanguage(await AsyncStorage.getItem(VOICE_LANGUAGE_KEY));
        const resolution = resolveVoiceLanguage({
          whisperLanguage: transcription.language,
          whisperConfidence: transcription.confidence,
          transcript: transcription.text,
          triage: spokenTriage,
          savedLanguage: storedLanguage,
        });
        if (storedLanguage && !savedLanguage) setSavedLanguage(storedLanguage);
        setResponseLanguage(resolution.language);
        setAskLanguage(resolution.needsSelection);
        handleVoiceReply(transcription.text);
        return;
      }

      const triage = await triageSymptoms({
        symptoms: transcription.text,
        language: transcription.language ?? undefined,
      });
      setResult(triage);
      const storedLanguage =
        savedLanguage ?? savedVoiceLanguage(await AsyncStorage.getItem(VOICE_LANGUAGE_KEY));
      if (storedLanguage) setSavedLanguage(storedLanguage);
      const resolution = resolveVoiceLanguage({
        whisperLanguage: transcription.language,
        whisperConfidence: transcription.confidence,
        transcript: transcription.text,
        triage,
        savedLanguage: storedLanguage,
      });
      setResponseLanguage(resolution.language);
      setAskLanguage(resolution.needsSelection);
      if (triage.urgency === 'EMERGENCY' || resolution.language) speakResult(triage, resolution.language);
    } catch {
      setVoiceError(
        'Voice recognition needs an internet connection, EXTERNAL_SERVICES_MODE=live, and a Groq API key on the TeleCare server. You can type symptoms instead; emergency words are checked on this phone.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMicPress = async () => {
    if (loading) return;
    setVoiceError(null);
    if (recorderState.isRecording) {
      try {
        await recorder.stop();
        if (recorder.uri) await handleTranscription(recorder.uri);
        else setVoiceError('No recording was captured. Please try again.');
      } catch {
        setVoiceError('The recording could not be stopped. Please try again.');
      }
      return;
    }

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setVoiceError('Allow microphone access in your phone settings to use voice search.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setVoiceError('The microphone could not start. Check its permission and try again.');
    }
  };

  const reset = () => {
    setInput('');
    setResult(null);
    setVoiceError(null);
    setAskLanguage(false);
    setUrgentRequestId(null);
    setUrgentRequestKey(null);
    setUrgentRequestReason(null);
    setResponseLanguage(savedLanguage);
    Speech.stop();
  };

  const sendUrgentRequest = async () => {
    const symptoms = input.trim();
    if (!symptoms || !result || result.urgency !== 'URGENT' || requestingDoctor) return;
    setRequestingDoctor(true);
    setVoiceError(null);
    setUrgentRequestReason(null);
    const requestKey = urgentRequestKey ?? Crypto.randomUUID();
    setUrgentRequestKey(requestKey);
    const language =
      responseLanguage === 'hindi'
        ? 'Hindi'
        : responseLanguage === 'garhwali'
          ? 'Garhwali'
          : responseLanguage === 'english'
            ? 'English'
            : null;
    try {
      const response = await createUrgentRequest(symptoms, language, requestKey);
      setResult(response.triage);
      if (response.triage.urgency === 'EMERGENCY') {
        setUrgentRequestId(null);
        setUrgentRequestKey(null);
        speakResult(response.triage, responseLanguage);
      } else if (response.request) {
        setUrgentRequestId(response.request.id);
        await AsyncStorage.setItem(activeUrgentRequestKey(patientId), response.request.id);
        setUrgentRequestKey(null);
        setUrgentRequestReason(null);
      } else {
        setUrgentRequestKey(null);
        setUrgentRequestReason(response.reason ?? 'An on-call doctor is not available right now.');
      }
    } catch {
      setVoiceError(
        'We could not send the request. Check your connection, or book a regular appointment. If this may be an emergency, call 112 or 108.',
      );
    } finally {
      setRequestingDoctor(false);
    }
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
                <AppText variant="title">Bolo / {'\u092c\u094b\u0932\u094b'}</AppText>
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

            {!result && (
              <View style={styles.inputSection}>
                <AppText variant="heading" style={{ textAlign: 'center' }}>
                  {
                    '\u0905\u092a\u0928\u0940 \u092a\u0930\u0947\u0936\u093e\u0928\u0940 \u092c\u0924\u093e\u090f\u0902 / Speak your problem'
                  }
                </AppText>
                <AppText color="textMuted" style={{ textAlign: 'center' }}>
                  Hindi, Hinglish, English, or Garhwali
                </AppText>
                <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
                  Short clips are sent to the TeleCare server and Groq for transcription, then deleted by
                  TeleCare. If offline, type symptoms; emergency words are checked on this phone.
                </AppText>

                <View style={styles.micContainer}>
                  <Pressable
                    style={[styles.bigMicButton, recorderState.isRecording && styles.bigMicActive]}
                    onPress={() => void handleMicPress()}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={recorderState.isRecording ? 'Finish recording' : 'Record symptoms'}
                  >
                    <Icon
                      name={ICONS.mic}
                      size={48}
                      color={recorderState.isRecording ? colors.accent : colors.surface}
                    />
                  </Pressable>
                  <AppText variant="label" color={recorderState.isRecording ? 'accent' : 'text'}>
                    {loading
                      ? 'Transcribing\u2026'
                      : recorderState.isRecording
                        ? 'Tap to finish speaking'
                        : 'Tap to speak'}
                  </AppText>
                </View>

                <Button
                  label="Hear offline options"
                  variant="secondary"
                  onPress={() =>
                    Speech.speak(
                      'You can type symptoms while offline. Emergency warning words are checked on this phone. For an emergency, call 112 or 108.',
                      { language: 'en-IN' },
                    )
                  }
                />

                {voiceError && <AppText color="danger">{voiceError}</AppText>}

                <TextField
                  label="Or type symptoms"
                  placeholder="For example: fever, knee pain, skin rash"
                  value={input}
                  onChangeText={setInput}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleTriage()}
                />
                <Button
                  label={loading ? 'Checking?' : 'Find doctor by symptoms'}
                  icon={ICONS.search}
                  disabled={!input.trim() || loading}
                  onPress={() => void handleTriage()}
                />

                <View style={styles.chipSection}>
                  <AppText variant="caption" color="textMuted">
                    Sample symptoms:
                  </AppText>
                  <View style={styles.chipRow}>
                    {SAMPLE_SYMPTOMS.map((sample) => (
                      <Pressable
                        key={sample.label}
                        style={styles.sampleChip}
                        onPress={() => void handleTriage(sample.text)}
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
                    EMERGENCY /{' '}
                    {
                      '\u0906\u092a\u093e\u0924\u0915\u093e\u0932\u0940\u0928 \u091a\u0947\u0924\u093e\u0935\u0928\u0940'
                    }
                  </AppText>
                </View>
                <AppText style={styles.emergencyNotice}>
                  Your symptoms suggest a severe medical emergency. Do not wait for an online appointment.
                  Contact emergency services or reach the nearest hospital immediately.
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
                  Recommended:{' '}
                  {SPECIALTY[result.recommendedSpecialization]?.plain ?? result.recommendedSpecialization}
                </AppText>
                <AppText color="textMuted">Specialty: {result.recommendedSpecialization}</AppText>

                <View style={styles.summaryBox}>
                  <AppText variant="caption" color="textMuted">
                    AI Symptom Assessment:
                  </AppText>
                  <AppText>{result.summary}</AppText>
                </View>

                <Banner tone="info" message={result.disclaimer} />

                {askLanguage && (
                  <View style={styles.languagePicker}>
                    <AppText variant="label">Which language do you prefer for spoken replies?</AppText>
                    <AppText variant="caption" color="textMuted">
                      We could not confirm the language confidently. Your choice is saved on this phone.
                    </AppText>
                    <View style={styles.languageOptions}>
                      {VOICE_LANGUAGES.map((language) => (
                        <Pressable
                          key={language.id}
                          style={styles.languageChip}
                          onPress={() => saveVoiceLanguage(language.id)}
                        >
                          <AppText variant="caption">{language.label}</AppText>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {voiceError && <AppText color="danger">{voiceError}</AppText>}
                {urgentRequestReason && <Banner tone="warning" message={urgentRequestReason} />}
                {result.urgency === 'URGENT' &&
                  (!urgentRequestId ||
                    urgentRequestQuery.data?.status === 'EXHAUSTED' ||
                    urgentRequestQuery.data?.status === 'CANCELLED') && (
                    <Button
                      label={
                        requestingDoctor ? 'Sending request…' : 'Send urgent request to an on-call doctor'
                      }
                      icon={ICONS.doctor}
                      loading={requestingDoctor}
                      disabled={requestingDoctor || loading}
                      onPress={() => void sendUrgentRequest()}
                    />
                  )}
                {urgentRequestId && (
                  <Card style={styles.urgentStatusCard}>
                    <AppText variant="label">Urgent doctor request</AppText>
                    {!urgentRequestQuery.data ? (
                      <AppText color="textMuted">Loading request status…</AppText>
                    ) : urgentRequestQuery.data.status === 'PENDING' ? (
                      <>
                        <AppText>
                          A request is waiting in the on-call doctor inbox. No phone call has been placed.
                        </AppText>
                        <AppText variant="caption" color="textMuted">
                          If symptoms worsen or you think this is an emergency, call 112 or 108 now.
                        </AppText>
                        <Button
                          label="Cancel request"
                          variant="secondary"
                          onPress={() => {
                            void cancelUrgentRequest(urgentRequestId)
                              .then(() => urgentRequestQuery.refetch())
                              .catch(() =>
                                setVoiceError('The request could not be cancelled. Please try again.'),
                              );
                          }}
                        />
                      </>
                    ) : urgentRequestQuery.data.status === 'ACCEPTED' ? (
                      <AppText>
                        A doctor accepted the request. Masked phone calls are not configured in this build, so
                        no callback was placed. Use a regular booking to arrange contact through the app.
                      </AppText>
                    ) : urgentRequestQuery.data.status === 'EXHAUSTED' ? (
                      <AppText>
                        No on-call doctor accepted in time. Please book a regular appointment. For emergency
                        symptoms, call 112 or 108.
                      </AppText>
                    ) : (
                      <AppText>This request was cancelled.</AppText>
                    )}
                  </Card>
                )}
                <Button
                  label="Hear suggestion again"
                  variant="secondary"
                  onPress={() => speakResult(result, responseLanguage)}
                />

                <View style={styles.actionRow}>
                  <Button
                    label={recorderState.isRecording ? 'Finish saying yes or no' : 'Say yes or no'}
                    icon={ICONS.mic}
                    variant="secondary"
                    onPress={() => void handleMicPress()}
                    disabled={loading}
                  />
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
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 700,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
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
  urgentStatusCard: {
    borderColor: colors.warning,
    borderWidth: 1,
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
  languagePicker: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  languageOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  languageChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
});
