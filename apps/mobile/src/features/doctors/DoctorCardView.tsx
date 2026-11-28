import { Pressable, StyleSheet, View } from 'react-native';
import type { DoctorCard } from '@telecare/shared';
import { ICONS } from '@/features/shell/icons';
import { AppText, Avatar, Icon, colors, radius, shadow, spacing, type IconName } from '@/ui';
import { formatExperience, formatFee, formatRating } from './format';
import { SPECIALTY } from './specialties';

export function DemoBadge() {
  return (
    <View style={styles.badge}>
      <AppText variant="caption" color="warning" style={{ fontWeight: '700' }}>
        Demo
      </AppText>
    </View>
  );
}

/** An icon and a short fact on one line. */
export function Fact({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={20} color="textMuted" />
      <AppText variant="small" color="textMuted" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

export const plainSpecialties = (d: Pick<DoctorCard, 'specializations'>) =>
  d.specializations.map((s) => SPECIALTY[s].plain).join(', ');

/** One doctor in the search results. The whole card is one button for screen readers. */
export function DoctorCardView({
  doctor,
  onPress,
  showAction = true,
}: {
  doctor: DoctorCard;
  onPress: () => void;
  /** The "Book consult" button; off where something else books (the receptionist). */
  showAction?: boolean;
}) {
  const summary = [
    doctor.name,
    plainSpecialties(doctor),
    `Speaks ${doctor.languages.join(', ')}`,
    `${formatExperience(doctor.experienceYears)} experience`,
    `Fee ${formatFee(doctor.feeInr)}`,
    doctor.ratingAvg === null
      ? 'New doctor, no ratings yet'
      : `Rated ${doctor.ratingAvg} from ${doctor.ratingCount} patients`,
  ].join('. ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.accentSoft }]}
    >
      <View style={styles.top}>
        <Avatar name={doctor.name} photoUrl={doctor.photoUrl} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <AppText variant="label" style={{ flexShrink: 1 }}>
              {doctor.name}
            </AppText>
            {!doctor.isDemo && <Icon name={ICONS.verified} size={18} color="primary" />}
          </View>
          <AppText variant="small" color="primary" style={{ fontWeight: '600' }}>
            {plainSpecialties(doctor)}
          </AppText>
          <AppText variant="small" color="textMuted">
            {formatExperience(doctor.experienceYears)} experience
          </AppText>
          <View style={styles.badges}>
            <View style={[styles.pill, doctor.ratingAvg === null ? styles.pillNew : styles.pillRating]}>
              <AppText variant="caption" color={doctor.ratingAvg === null ? 'textMuted' : 'onPrimary'}>
                {formatRating(doctor)}
              </AppText>
            </View>
            {doctor.isDemo && <DemoBadge />}
          </View>
        </View>
      </View>
      <Fact icon={ICONS.language} text={`Speaks ${doctor.languages.join(', ')}`} />
      <View style={styles.footer}>
        <View>
          <AppText variant="caption" color="textMuted">
            Consultation fee
          </AppText>
          <AppText variant="heading">{formatFee(doctor.feeInr)}</AppText>
        </View>
        {showAction && (
          <View style={styles.cta} importantForAccessibility="no-hide-descendants">
            <Icon name={ICONS.video} size={20} color="onPrimary" />
            <AppText variant="small" color="onPrimary" style={{ fontWeight: '700' }}>
              Book consult
            </AppText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow,
  },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, alignItems: 'center' },
  pill: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillRating: { backgroundColor: colors.success },
  pillNew: { backgroundColor: colors.background },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  badge: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    marginTop: 2,
  },
});
