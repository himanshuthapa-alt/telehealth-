import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Order, OrderAddress, Prescription } from '@telecare/shared';
import { useCreateOrder } from '@/features/orders/order-queries';
import { api } from '@/lib/api';
import { AppText, Button, Icon, MicButton, colors, radius, spacing } from '@/ui';
import { useVoiceCapabilities, useVoiceTurn, type Understood } from './cloud-voice';
import { yesNo } from './receptionist';
import { speak } from './speech-api';

type Line = { from: 'ai' | 'me'; text: string };
type Stage = 'loading' | 'ask' | 'ordered' | 'declined' | 'needs-form';

/** The order a voice "yes" places: what is still left on the prescription. */
export function voiceOrderFor(rx: Prescription) {
  const items = rx.items
    .filter((i) => i.medicineId && i.quantity - i.orderedQuantity > 0)
    .map((i) => ({ ...i, packs: i.quantity - i.orderedQuantity }));
  const totalPaise = items.reduce((sum, i) => sum + (i.pricePaise ?? 0) * i.packs, 0);
  return { items, totalPaise };
}

const rupees = (paise: number) => `${Math.round(paise / 100)} rupees`;

/**
 * "The doctor prescribed 2 medicines, 125 rupees, cash on delivery to your
 * address. Shall I order?" Yes places the order; no leaves it. The patient's
 * address comes from their last order; the first time, the order form is used.
 */
export function VoiceOrderModal({
  visible,
  onClose,
  prescription,
}: {
  visible: boolean;
  onClose: () => void;
  prescription: Prescription;
}) {
  // Mounted only while open, so each visit re-reads what is left to order.
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      {visible && <VoiceOrder onClose={onClose} prescription={prescription} />}
    </Modal>
  );
}

const NOTHING_LEFT = 'Everything on this prescription that we stock is already ordered.';

function VoiceOrder({ onClose, prescription }: { onClose: () => void; prescription: Prescription }) {
  const nothingLeft = voiceOrderFor(prescription).items.length === 0;
  const cloud = useVoiceCapabilities().data?.indianLanguages === true;
  const createOrder = useCreateOrder();
  const [lines, setLines] = useState<Line[]>(nothingLeft ? [{ from: 'ai', text: NOTHING_LEFT }] : []);
  const [stage, setStage] = useState<Stage>(nothingLeft ? 'declined' : 'loading');
  const [address, setAddress] = useState<OrderAddress | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const lang = useRef('hi-IN');

  const say = useCallback((text: string) => {
    setLines((l) => [...l, { from: 'ai', text }]);
    void speak(text, lang.current).catch(() => {});
  }, []);

  const openForm = useCallback(() => {
    onClose();
    router.navigate({
      pathname: '/patient/medicines/order-builder',
      params: { prescriptionId: prescription.id },
    });
  }, [onClose, prescription.id]);

  // On open: find the address, then read the order out and ask.
  useEffect(() => {
    const { items, totalPaise } = voiceOrderFor(prescription);
    if (items.length === 0) return void speak(NOTHING_LEFT, lang.current).catch(() => {});
    api
      .get<Order[]>('/v1/orders')
      .then((orders) => {
        const last = orders[0]?.address ?? null;
        setAddress(last);
        if (!last) {
          setStage('needs-form');
          return say(
            'I need your delivery address once. Please fill the order form; next time I can order by voice.',
          );
        }
        const names = items.map((i) => i.medicineName).join(', ');
        setStage('ask');
        say(
          `${prescription.doctor.name} prescribed ${items.length === 1 ? '1 medicine' : `${items.length} medicines`}: ${names}. ` +
            `Total ${rupees(totalPaise)}, cash on delivery to ${last.addressLine}, ${last.district}. Shall I order it? Say yes or no.`,
        );
      })
      .catch(() => {
        setStage('needs-form');
        say("Sorry, I couldn't check your address. Please use the order form.");
      });
  }, [prescription, say]);

  const answer = useCallback(
    async (text: string, shown = text) => {
      setLines((l) => [...l, { from: 'me', text: shown }]);
      if (stage !== 'ask' || !address) return;
      const reply = yesNo(text);
      if (reply === null) return say('Please say yes to order, or no to leave it.');
      if (reply === 'no') {
        setStage('declined');
        return say("Okay, I won't order it. You can change the quantities on the order form.");
      }
      try {
        const order = await createOrder.mutateAsync({
          prescriptionId: prescription.id,
          address,
          items: voiceOrderFor(prescription).items.map((i) => ({
            prescriptionItemId: i.id,
            medicineId: i.medicineId!,
            quantity: i.packs,
          })),
        });
        setOrderId(order.id);
        setStage('ordered');
        say(
          `Order placed. Your tracking ID is ${order.trackingId}. Pay ${rupees(order.totalPaise)} in cash when it arrives.`,
        );
      } catch {
        say("Sorry, I couldn't place the order, maybe a medicine ran out. Please use the order form.");
        setStage('needs-form');
      }
    },
    [stage, address, prescription, createOrder, say],
  );

  const onHeard = useCallback(
    (u: Understood) => {
      if (u.languageCode) lang.current = u.languageCode;
      return answer(u.transcript || '…');
    },
    [answer],
  );
  const { mic, press } = useVoiceTurn(onHeard, say);

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Icon name={{ android: 'local_shipping', ios: 'shippingbox' }} size={28} color="primary" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Order by voice</AppText>
          <AppText variant="caption" color="textMuted">
            Say yes or no. Cash on delivery.
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
          <Icon name={{ android: 'close', ios: 'xmark' }} size={28} color="text" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.chat}>
        {lines.map((l, i) => (
          <View key={i} style={[styles.bubble, l.from === 'me' ? styles.mine : styles.theirs]}>
            <AppText color={l.from === 'me' ? 'onPrimary' : 'text'}>{l.text}</AppText>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {stage === 'ask' && (
          <>
            {cloud && <MicButton status={mic} onPress={() => void press()} />}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Yes"
                  icon={{ android: 'check', ios: 'checkmark' }}
                  onPress={() => void answer('yes', 'Yes')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="No" variant="secondary" onPress={() => void answer('no', 'No')} />
              </View>
            </View>
          </>
        )}
        {stage === 'ordered' && orderId && (
          <Button
            label="Track my order"
            onPress={() => {
              onClose();
              router.navigate({ pathname: '/patient/medicines/order/[id]', params: { id: orderId } });
            }}
          />
        )}
        {(stage === 'needs-form' || stage === 'declined') && (
          <Button label="Open the order form" variant="secondary" onPress={openForm} />
        )}
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
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
