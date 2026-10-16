import { Pressable, StyleSheet, View } from 'react-native';
import { istDate, isExpired, type Prescription } from '@telecare/shared';
import { formatDay } from '@/features/appointments/format';
import { ICONS } from '@/features/shell/icons';
import { AppText, Icon, colors, radius, spacing } from '@/ui';

/** Valid / Expired / Withdrawn, as words with an icon (never colour alone). */
export function prescriptionState(p: Prescription, now = new Date()) {
  if (p.status === 'VOIDED')
    return { label: 'Withdrawn by the doctor', tone: 'danger' as const, icon: ICONS.cancel };
  if (p.status === 'DRAFT')
    return { label: 'Draft (not sent yet)', tone: 'textMuted' as const, icon: ICONS.edit };
  if (isExpired(p, istDate(now)))
    return { label: 'Expired', tone: 'textMuted' as const, icon: ICONS.warning };
  return { label: `Valid until ${formatDay(p.validUntil!)}`, tone: 'success' as const, icon: ICONS.check };
}

/** A prescription in a list. */
export function PrescriptionCard({
  prescription: p,
  onPress,
}: {
  prescription: Prescription;
  onPress: () => void;
}) {
  const state = prescriptionState(p);
  const names = p.items.map((i) => i.medicineName).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Prescription from ${p.doctor.name}. ${p.items.length} medicines: ${names}. ${state.label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.primarySoft }]}
    >
      <View style={styles.icon}>
        <Icon name={ICONS.medicines} size={30} color="primary" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{p.doctor.name}</AppText>
        <AppText color="textMuted">
          {p.issuedAt ? formatDay(istDate(p.issuedAt)) : 'Not sent yet'} ·{' '}
          {p.items.length === 1 ? '1 medicine' : `${p.items.length} medicines`}
        </AppText>
        <AppText variant="small" numberOfLines={2}>
          {names}
        </AppText>
        <View style={styles.state}>
          <Icon name={state.icon} size={20} color={state.tone} />
          <AppText variant="caption" color={state.tone} style={{ fontWeight: '700' }}>
            {state.label}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
});
