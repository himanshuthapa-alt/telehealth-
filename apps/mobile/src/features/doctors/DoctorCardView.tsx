import { Pressable, StyleSheet, View } from 'react-native';
import type { DoctorCard } from '@telecare/shared';
import { ICONS } from '@/features/shell/icons';
import { AppText, Avatar, Icon, colors, radius, spacing, type IconName } from '@/ui';
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
      <Icon name={icon} size={22} color="textMuted" />
      <AppText color="textMuted" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

export const plainSpecialties = (d: Pick<DoctorCard, 'specializations'>) =>
  d.specializations.map((s) => SPECIALTY[s].plain).join(', ');

/** One doctor in the search results. The whole card is one button for screen readers. */
export function DoctorCardView({ doctor, onPress }: { doctor: DoctorCard; onPress: () => void }) {
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
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.primarySoft }]}
    >
      <View style={styles.top}>
        <Avatar name={doctor.name} photoUrl={doctor.photoUrl} size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">{doctor.name}</AppText>
          <AppText color="primary" style={{ fontWeight: '600' }}>
            {plainSpecialties(doctor)}
          </AppText>
          {doctor.isDemo && (
            <View style={{ flexDirection: 'row' }}>
              <DemoBadge />
            </View>
          )}
        </View>
      </View>
      <Fact icon={ICONS.language} text={`Speaks ${doctor.languages.join(', ')}`} />
      <Fact icon={ICONS.doctor} text={`${formatExperience(doctor.experienceYears)} experience`} />
      <View style={styles.footer}>
        <AppText variant="heading">{formatFee(doctor.feeInr)}</AppText>
        <AppText variant="label" color={doctor.ratingAvg === null ? 'textMuted' : 'text'}>
          {formatRating(doctor)}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.background,
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
