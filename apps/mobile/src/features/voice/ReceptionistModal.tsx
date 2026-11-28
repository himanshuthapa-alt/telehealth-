import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { parseVoiceIntent, type Specialization, type VoiceIntent } from '@telecare/shared';
import { useBookAppointment } from '@/features/appointments/appointment-queries';
import { DoctorCardView } from '@/features/doctors/DoctorCardView';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { AppText, Button, Icon, MicButton, TextField, colors, radius, spacing } from '@/ui';
import { useVoiceCapabilities, useVoiceTurn, type Understood } from './cloud-voice';
import {
  LANGUAGE_BY_CODE,
  SAY,
  findOffer,
  offerKey,
  understandProblem,
  yesNo,
  type Offer,
} from './receptionist';
import { speak } from './speech-api';

type Line = { from: 'ai' | 'me'; text: string };
type Stage = 'problem' | 'offer' | 'booked' | 'emergency';
const MAX_OFFERS = 3;

/**
 * Talk to a receptionist who connects you to the right doctor: say the
 * problem in any Indian language, hear one suggestion, say yes or no.
 */
export function ReceptionistModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // Mounted only while open, so every visit starts a fresh conversation.
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      {visible && <Conversation onClose={onClose} />}
    </Modal>
  );
}

function Conversation({ onClose }: { onClose: () => void }) {
  const cloud = useVoiceCapabilities().data?.indianLanguages === true;
  const book = useBookAppointment();
  const [lines, setLines] = useState<Line[]>([{ from: 'ai', text: SAY.greet }]);
  const [busy, setBusy] = useState(false); // finding a doctor or booking
  const [stage, setStage] = useState<Stage>('problem');
  const [offer, setOffer] = useState<Offer | null>(null);
  const [typed, setTyped] = useState('');
  const lang = useRef('hi-IN'); // the patient's language, updated from what they speak
  const problem = useRef<{ specialization: Specialization; words: string } | null>(null);
  const declined = useRef(new Set<string>());
  const unclearCount = useRef(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const say = useCallback((text: string) => {
    setLines((l) => [...l, { from: 'ai', text }]);
    void speak(text, lang.current).catch(() => {});
  }, []);

  useEffect(() => {
    void speak(SAY.greet, lang.current).catch(() => {});
  }, []);

  const nextOffer = useCallback(async () => {
    if (!problem.current) return;
    if (declined.current.size >= MAX_OFFERS) {
      say(SAY.tooMany);
      onClose();
      router.navigate({
        pathname: '/patient/doctors',
        params: { specialization: problem.current.specialization },
      });
      return;
    }
    setBusy(true);
    try {
      const found = await findOffer(
        api.get,
        problem.current.specialization,
        LANGUAGE_BY_CODE[lang.current],
        declined.current,
      );
      setOffer(found);
      if (found) {
        setStage('offer');
        say(SAY.offer(found));
      } else say(SAY.none);
    } catch {
      say(SAY.failed);
    } finally {
      setBusy(false);
    }
  }, [onClose, say]);

  const confirm = useCallback(async () => {
    if (!offer || !problem.current) return;
    setBusy(true);
    try {
      await book.mutateAsync({
        request: { doctorId: offer.doctor.id, startAt: offer.startAt, reasonNote: problem.current.words },
        idempotencyKey: Crypto.randomUUID(),
      });
      setStage('booked');
      say(SAY.booked(offer));
    } catch (err) {
      const taken =
        err instanceof ApiError && err.failure.kind === 'http' && err.failure.code === 'SLOT_TAKEN';
      if (!taken) return say(SAY.failed);
      declined.current.add(offerKey(offer));
      say(SAY.taken);
      await nextOffer();
    } finally {
      setBusy(false);
    }
  }, [offer, book, say, nextOffer]);

  const decline = useCallback(async () => {
    if (offer) declined.current.add(offer.doctor.id); // "no" = a different doctor
    await nextOffer();
  }, [offer, nextOffer]);

  /** One thing the patient said (English meaning + its intent). */
  const hear = useCallback(
    async (english: string, intent: VoiceIntent, shown = english) => {
      setLines((l) => [...l, { from: 'me', text: shown }]);
      const heard = understandProblem(intent);
      if (heard.kind === 'emergency') {
        setStage('emergency');
        return say(SAY.emergency);
      }
      if (stage === 'offer') {
        const answer = yesNo(english);
        if (answer === 'yes') return confirm();
        if (answer === 'no') return decline();
        if (heard.kind !== 'specialty') return say(SAY.askYesNo);
      }
      if (stage === 'booked') return;
      if (heard.kind === 'unclear' && ++unclearCount.current < 2) return say(SAY.unclear);
      // A vague answer twice: a general physician is the right first doctor.
      const specialization = heard.kind === 'specialty' ? heard.specialization : 'General Physician';
      problem.current = { specialization, words: english.slice(0, 200) };
      declined.current = new Set();
      await nextOffer();
    },
    [stage, say, confirm, decline, nextOffer],
  );

  const onHeard = useCallback(
    async (u: Understood) => {
      if (u.languageCode) lang.current = u.languageCode;
      if (!u.transcript) return say(SAY.unclear);
      await hear(u.transcript, u.intent);
    },
    [hear, say],
  );
  const { mic, press: onMic } = useVoiceTurn(onHeard, say);

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    void hear(text, parseVoiceIntent(text));
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Icon
            name={{ android: 'support_agent', ios: 'person.crop.circle.badge.questionmark' }}
            size={28}
            color="primary"
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Receptionist</AppText>
          <AppText variant="caption" color="textMuted">
            Speak in any Indian language. I only connect you to a doctor.
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
          <Icon name={{ android: 'close', ios: 'xmark' }} size={28} color="text" />
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.chat}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {lines.map((l, i) => (
          <View key={i} style={[styles.bubble, l.from === 'me' ? styles.mine : styles.theirs]}>
            <AppText color={l.from === 'me' ? 'onPrimary' : 'text'}>{l.text}</AppText>
          </View>
        ))}
        {stage === 'offer' && offer && (
          <View style={{ gap: spacing.sm }}>
            <DoctorCardView doctor={offer.doctor} onPress={() => {}} showAction={false} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Yes"
                  icon={{ android: 'check', ios: 'checkmark' }}
                  onPress={() => void hear('yes', { kind: 'unknown' }, 'Yes')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="No"
                  variant="secondary"
                  onPress={() => void hear('no', { kind: 'unknown' }, 'No')}
                />
              </View>
            </View>
          </View>
        )}
        {stage === 'booked' && (
          <Button
            label="See my booking"
            onPress={() => {
              onClose();
              router.navigate('/patient/appointments');
            }}
          />
        )}
        {stage === 'emergency' && (
          <View style={styles.row}>
            {['108', '112'].map((n) => (
              <View key={n} style={{ flex: 1 }}>
                <Button label={`Call ${n}`} variant="danger" onPress={() => Linking.openURL(`tel:${n}`)} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {cloud && <MicButton status={busy ? 'thinking' : mic} onPress={() => void onMic()} />}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextField
              label={cloud ? 'Or type' : 'Type your problem'}
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={sendTyped}
              returnKeyType="send"
              placeholder="e.g. my child has fever"
            />
          </View>
          <View style={{ justifyContent: 'flex-end' }}>
            <Button label="Send" variant="secondary" onPress={sendTyped} disabled={!typed.trim()} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chat: { padding: spacing.md, gap: spacing.sm },
  bubble: { maxWidth: '85%', padding: spacing.md, borderRadius: radius.lg },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  row: { flexDirection: 'row', gap: spacing.sm },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
