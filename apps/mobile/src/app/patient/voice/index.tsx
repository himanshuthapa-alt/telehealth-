import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SPECIALIZATION_HI, SYMPTOM_TAGS, type DoctorCard } from '@telecare/shared';
import { useVoiceSession, type OnCallDoctor, type TurnResponse } from '@/features/voice/voice-session';
import { speakReply, stopSpeaking } from '@/features/voice/speak';
import { MicButton } from '@/features/voice/MicButton';
import { ICONS } from '@/features/shell/icons';
import {
  AppText,
  Avatar,
  Banner,
  Button,
  Card,
  Chip,
  Icon,
  Screen,
  TextField,
  colors,
  radius,
  spacing,
} from '@/ui';

const TAG_HI = new Map(SYMPTOM_TAGS.map((t) => [t.code, t.labelHi]));

const EXAMPLES = [
  { label: 'बुखार-खांसी', text: 'तीन दिन से बुखार और खांसी है' },
  { label: 'त्वचा', text: 'मेरे हाथ पर खुजली और दाने हो गए हैं' },
  { label: 'बच्चा / कान', text: 'mere bachche ko kaan me dard hai' },
  { label: 'इमरजेंसी', text: 'सीने में बहुत तेज़ दर्द है और साँस नहीं आ रही' },
];

type Phase = 'idle' | 'thinking' | 'result';

export default function VoiceScreen() {
  const voice = useVoiceSession();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<TurnResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const [typed, setTyped] = useState('');

  const run = useCallback(async (submit: () => Promise<TurnResponse>) => {
    setError(null);
    setPhase('thinking');
    try {
      const res = await submit();
      setResult(res);
      setPhase('result');
      speakReply(res);
    } catch {
      setError('अभी जुड़ नहीं पाए। थोड़ी देर में फिर कोशिश करें।');
      setPhase('idle');
    }
  }, []);

  const sendText = (text: string) => {
    const t = text.trim();
    if (t) void run(() => voice.submitTranscript(t));
  };

  const reset = () => {
    stopSpeaking();
    setResult(null);
    setError(null);
    setTyped('');
    setPhase('idle');
  };

  // ---- Emergency lane: full warning, nothing booked ----
  if (phase === 'result' && result?.urgency === 'EMERGENCY') {
    return (
      <Screen edges={['top']}>
        <View style={styles.emergency}>
          <Icon name={ICONS.emergency} size={56} color="danger" />
          <AppText variant="title" color="danger" style={styles.center}>
            यह इमरजेंसी हो सकती है
          </AppText>
          <AppText variant="heading" style={styles.center}>
            अभी 112 या एम्बुलेंस के लिए 108 पर कॉल करें।
          </AppText>
          <View style={styles.callRow}>
            <View style={styles.callBtn}>
              <Button label="108" icon={ICONS.call} variant="danger" onPress={() => Linking.openURL('tel:108')} />
              <AppText variant="caption" color="textMuted" style={styles.center}>
                एम्बुलेंस
              </AppText>
            </View>
            <View style={styles.callBtn}>
              <Button label="112" icon={ICONS.call} variant="danger" onPress={() => Linking.openURL('tel:112')} />
              <AppText variant="caption" color="textMuted" style={styles.center}>
                इमरजेंसी
              </AppText>
            </View>
          </View>
          {result.emergencyReason && (
            <AppText variant="caption" color="textMuted" style={styles.center}>
              सुना गया संकेत: {result.emergencyReason} · कुछ भी बुक नहीं किया गया।
            </AppText>
          )}
          <Button label="वापस जाएँ" variant="ghost" onPress={reset} />
        </View>
      </Screen>
    );
  }

  // ---- Result lane: specialty + doctors ----
  if (phase === 'result' && result) {
    const specHi = result.specialization ? SPECIALIZATION_HI[result.specialization] : 'सामान्य डॉक्टर';
    const urgent = result.urgency === 'URGENT';
    const doctors = result.doctors ?? [];
    const onCall = result.onCallDoctors ?? [];
    return (
      <Screen edges={['top']}>
        <Banner tone="warning" message="मैं डॉक्टर नहीं हूँ — यह सलाह नहीं, सिर्फ़ सही डॉक्टर तक पहुँचाने के लिए है।" />
        <Card>
          <View style={styles.rowBetween}>
            <Chip label={urgent ? 'ज़रूरी' : 'सामान्य'} selected={urgent} onPress={() => undefined} />
            <Pressable accessibilityRole="button" accessibilityLabel="फिर सुनें" onPress={() => speakReply(result)}>
              <Icon name={ICONS.speaker} size={28} color="primary" />
            </Pressable>
          </View>
          <AppText color="textMuted">आपने कहा:</AppText>
          <AppText variant="label">{result.transcript}</AppText>

          <View style={styles.aiBox}>
            <AppText variant="caption" color="textMuted">
              एआई सारांश — यह निदान नहीं है
            </AppText>
            {result.tags.length > 0 && (
              <View style={styles.tags}>
                {result.tags.map((code) => (
                  <View key={code} style={styles.tag}>
                    <AppText variant="small" color="primary">
                      {TAG_HI.get(code) ?? code}
                    </AppText>
                  </View>
                ))}
              </View>
            )}
            <AppText variant="label">
              सुझाया गया विभाग: <AppText variant="label" color="info">{specHi}</AppText>
            </AppText>
          </View>
        </Card>

        {urgent && (
          <Banner
            tone="info"
            message={
              result.dispatch
                ? 'डॉक्टर को अभी बुलाया गया है। वे इसी नंबर पर कॉल करेंगे।'
                : 'यह ज़रूरी है — अभी उपलब्ध डॉक्टर ढूँढ रहे हैं।'
            }
          />
        )}

        <AppText variant="heading">{urgent ? 'अभी उपलब्ध डॉक्टर' : 'उपलब्ध डॉक्टर'}</AppText>
        {urgent
          ? onCall.map((d) => <OnCallRow key={d.id} doctor={d} />)
          : doctors.map((d) => <DoctorRow key={d.id} doctor={d} />)}
        {doctors.length === 0 && onCall.length === 0 && (
          <AppText color="textMuted">अभी इस विभाग में कोई डॉक्टर नहीं मिला। सामान्य डॉक्टर से बात करें।</AppText>
        )}

        {result.specialization && (
          <Button
            label="इन डॉक्टरों से मिलें"
            icon={ICONS.doctor}
            onPress={() =>
              router.navigate({
                pathname: '/patient/doctors',
                params: { specialization: result.specialization as string },
              })
            }
          />
        )}
        <Button label="↺ नई तकलीफ़ बोलें" variant="secondary" icon={ICONS.mic} onPress={reset} />
      </Screen>
    );
  }

  // ---- Idle / listening ----
  return (
    <Screen edges={['top']}>
      <Banner tone="warning" message="मैं डॉक्टर नहीं हूँ, यह सलाह नहीं है। इमरजेंसी में 112 या 108 पर कॉल करें।" />
      <AppText variant="title" style={styles.center}>
        अपनी तकलीफ़ बोलिए
      </AppText>
      <AppText color="textMuted" style={styles.center}>
        हिंदी, हिंग्लिश या इंग्लिश — Tell me your problem
      </AppText>

      {phase === 'thinking' ? (
        <View style={styles.thinking}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText variant="label" color="textMuted">
            समझ रहा हूँ…
          </AppText>
        </View>
      ) : (
        <MicButton
          busy={false}
          onClip={(uri) => void run(() => voice.submitAudio(uri))}
          onUnavailable={(reason) => {
            setMicBlocked(true);
            setError(reason);
          }}
        />
      )}

      {error && <Banner tone={micBlocked ? 'info' : 'danger'} message={error} />}

      <TextField
        label="या यहाँ लिखें (type here)"
        value={typed}
        onChangeText={setTyped}
        placeholder="जैसे: दो दिन से बुखार है"
        returnKeyType="send"
        onSubmitEditing={() => sendText(typed)}
      />
      <Button label="भेजें" icon={ICONS.send} variant="secondary" onPress={() => sendText(typed)} />

      <AppText variant="label" color="textMuted">
        उदाहरण:
      </AppText>
      <View style={styles.examples}>
        {EXAMPLES.map((ex) => (
          <Chip key={ex.label} label={ex.label} onPress={() => sendText(ex.text)} />
        ))}
      </View>

      <AppText variant="caption" color="textMuted" style={styles.center}>
        हर मेडिकल फ़ैसला एक रजिस्टर्ड डॉक्टर (RMP) करता है।
      </AppText>
    </Screen>
  );
}

function DoctorRow({ doctor }: { doctor: DoctorCard }) {
  return (
    <Card>
      <View style={styles.docRow}>
        <Avatar name={doctor.name} photoUrl={doctor.photoUrl} />
        <View style={styles.flex}>
          <AppText variant="label">{doctor.name}</AppText>
          <AppText variant="small" color="textMuted">
            {doctor.specializations.join(', ')}
          </AppText>
          <AppText variant="small" color="textMuted">
            🗣 {doctor.languages.join(', ')}
            {doctor.ratingAvg ? `  ★ ${doctor.ratingAvg}` : ''}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

function OnCallRow({ doctor }: { doctor: OnCallDoctor }) {
  return (
    <Card>
      <View style={styles.docRow}>
        <Avatar name={doctor.name} />
        <View style={styles.flex}>
          <AppText variant="label">{doctor.name}</AppText>
          <AppText variant="small" color="success">
            ● अभी उपलब्ध (on-call)
          </AppText>
          <AppText variant="small" color="textMuted">
            {doctor.specializations.join(', ')} · 🗣 {doctor.languages.join(', ')}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  thinking: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  aiBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.xs },
  tag: {
    backgroundColor: colors.infoSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  docRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  flex: { flex: 1 },
  emergency: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.danger,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  callRow: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  callBtn: { flex: 1, gap: spacing.xs },
});
