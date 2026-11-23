import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { MESSAGE_MAX_LENGTH, type ChatMessage, type PrescriptionCardBody } from '@telecare/shared';
import { formatTime } from '@/features/appointments/format';
import { ICONS } from '@/features/shell/icons';
import { AppText, Icon, colors, minTouchTarget, radius, spacing, typography } from '@/ui';
import type { OutboxItem } from './merge';

function Bubble({
  mine,
  body,
  meta,
  failed,
  onPress,
}: {
  mine: boolean;
  body: string;
  meta: string;
  failed?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs, failed && styles.failed]}>
      <AppText color={mine ? 'onPrimary' : 'text'}>{body}</AppText>
      <AppText variant="caption" color={mine ? 'onPrimary' : 'textMuted'} style={{ opacity: 0.85 }}>
        {meta}
      </AppText>
    </View>
  );
  return (
    <View style={[styles.row, mine && { justifyContent: 'flex-end' }]}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${body}. ${meta}`} onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
}

/** The prescription, posted into the chat when the doctor issues it (blueprint §13.3). */
function PrescriptionMessage({ body, onOpen }: { body: string; onOpen: (id: string) => void }) {
  const card = JSON.parse(body) as PrescriptionCardBody;
  return (
    <View style={styles.rxCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon name={ICONS.medicines} size={30} color="onAccent" />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color="onAccent">
            Prescription from the doctor
          </AppText>
          <AppText color="onAccent">
            {card.itemCount === 1 ? '1 medicine' : `${card.itemCount} medicines`}
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open the prescription"
        onPress={() => onOpen(card.prescriptionId)}
        style={styles.rxOpen}
      >
        <AppText variant="label" color="onPrimary">
          Open the prescription
        </AppText>
      </Pressable>
    </View>
  );
}

/** The consultation chat: big bubbles, clear sending state, one big Send button. */
export function Chat({
  messages,
  outbox,
  myId,
  otherName,
  canSend,
  onSend,
  onRetry,
  onOpenPrescription,
}: {
  messages: ChatMessage[];
  outbox: OutboxItem[];
  myId: string;
  otherName: string;
  canSend: boolean;
  onSend: (body: string) => void;
  onRetry: (item: OutboxItem) => void;
  onOpenPrescription: (prescriptionId: string) => void;
}) {
  const [text, setText] = useState('');
  const scroll = useRef<ScrollViewInstance>(null);
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText('');
  };

  return (
    <View style={styles.chat}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        accessibilityLabel="Chat messages"
      >
        {messages.length === 0 && outbox.length === 0 && (
          <AppText color="textMuted" style={styles.center}>
            You can also type here. Messages stay even if the video stops.
          </AppText>
        )}
        {messages.map((m) =>
          m.type === 'PRESCRIPTION_CARD' ? (
            <PrescriptionMessage key={m.id} body={m.body} onOpen={onOpenPrescription} />
          ) : m.type === 'SYSTEM' ? (
            <AppText key={m.id} variant="small" color="textMuted" style={[styles.center, styles.system]}>
              {m.body}
            </AppText>
          ) : (
            <Bubble
              key={m.id}
              mine={m.senderId === myId}
              body={m.body}
              meta={`${m.senderId === myId ? 'You' : otherName}, ${formatTime(m.createdAt)}`}
            />
          ),
        )}
        {outbox.map((o) => (
          <Bubble
            key={o.clientMsgId}
            mine
            body={o.body}
            failed={o.state === 'failed'}
            meta={o.state === 'sending' ? 'Sending…' : 'Not sent. Tap to try again.'}
            onPress={o.state === 'failed' ? () => onRetry(o) : undefined}
          />
        ))}
      </ScrollView>

      {canSend && (
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Type a message"
            placeholder="Type a message"
            placeholderTextColor={colors.textDisabled}
            value={text}
            onChangeText={setText}
            maxLength={MESSAGE_MAX_LENGTH}
            multiline
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !text.trim() }}
            disabled={!text.trim()}
            onPress={submit}
            style={[styles.send, !text.trim() && { opacity: 0.5 }]}
          >
            <Icon name={ICONS.send} size={26} color="onPrimary" />
            <AppText variant="label" color="onPrimary">
              Send
            </AppText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  list: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row' },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  theirs: { backgroundColor: colors.background, borderBottomLeftRadius: radius.sm },
  failed: { backgroundColor: colors.danger },
  system: { paddingVertical: spacing.xs },
  rxCard: { backgroundColor: colors.accent, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  rxOpen: {
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  input: {
    flex: 1,
    minHeight: minTouchTarget,
    maxHeight: 140,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  send: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
});
