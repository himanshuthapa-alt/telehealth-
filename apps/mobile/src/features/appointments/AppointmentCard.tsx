import { Pressable, StyleSheet, View } from 'react-native';
import {
  canJoinNow,
  istDate,
  istParts,
  joinWindow,
  type Appointment,
  type AppointmentStatus,
} from '@telecare/shared';
import { SPECIALTY } from '@/features/doctors/specialties';
import { ICONS } from '@/features/shell/icons';
import { useNow } from '@/lib/use-now';
import { AppText, Icon, Token, colors, radius, spacing, type IconName } from '@/ui';
import { formatDay, formatTime, formatWhen } from './format';

const STATUS: Record<
  AppointmentStatus,
  { label: string; tone: 'info' | 'success' | 'danger' | 'textMuted'; icon: IconName }
> = {
  BOOKED: { label: 'Booked', tone: 'info', icon: ICONS.check },
  COMPLETED: { label: 'Done', tone: 'success', icon: ICONS.check },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: ICONS.cancel },
  NO_SHOW: { label: 'Missed', tone: 'textMuted', icon: ICONS.warning },
};

/** Status as icon + word + colour (never colour alone). */
export function StatusPill({ status }: { status: AppointmentStatus }) {
  const { label, tone, icon } = STATUS[status];
  return (
    <View style={[styles.pill, { borderColor: colors[tone] }]}>
      <Icon name={icon} size={18} color={tone} />
      <AppText variant="caption" color={tone} style={{ fontWeight: '700' }}>
        {label}
      </AppText>
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A calendar leaf: month on top, the day number large. Readable at a glance. */
function DateLeaf({ startAt }: { startAt: string }) {
  const p = istParts(startAt);
  return (
    <View style={styles.leaf}>
      <AppText variant="caption" color="onPrimary" style={styles.leafMonth}>
        {MONTHS[p.month - 1]}
      </AppText>
      <AppText style={styles.leafDay}>{p.day}</AppText>
    </View>
  );
}

const whoFor = (a: Appointment, viewer: 'PATIENT' | 'DOCTOR') =>
  viewer === 'PATIENT' ? a.doctor.name : a.patient.name;
const plainSpecialty = (a: Appointment) => a.doctor.specializations.map((s) => SPECIALTY[s].plain).join(', ');

/** An appointment in a list. Patients see the doctor; doctors see the patient. */
export function AppointmentCard({
  appointment: a,
  viewer,
  onPress,
  timeOnly = false,
}: {
  appointment: Appointment;
  viewer: 'PATIENT' | 'DOCTOR';
  onPress: () => void;
  /** Show only the time (for the doctor's Today list). */
  timeOnly?: boolean;
}) {
  const who = whoFor(a, viewer);
  const detail =
    viewer === 'PATIENT'
      ? plainSpecialty(a)
      : [a.patient.age !== null ? `${a.patient.age} years` : null, a.reasonNote].filter(Boolean).join(' · ');
  const when = timeOnly ? formatTime(a.startAt) : formatWhen(a.startAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${when}. ${who}. ${detail}. ${STATUS[a.status].label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.primarySoft }]}
    >
      <DateLeaf startAt={a.startAt} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="heading">{formatTime(a.startAt)}</AppText>
        {!timeOnly && <AppText color="textMuted">{formatDay(istDate(a.startAt))}</AppText>}
        <AppText variant="label">{who}</AppText>
        {detail !== '' && (
          <AppText variant="small" color="textMuted" numberOfLines={2}>
            {detail}
          </AppText>
        )}
        <View style={{ flexDirection: 'row', marginTop: spacing.xs }}>
          <StatusPill status={a.status} />
        </View>
      </View>
    </Pressable>
  );
}

/** The appointment as an OPD-style token: for Home, the booked screen and the booking's own page. */
export function AppointmentToken({
  appointment: a,
  viewer,
}: {
  appointment: Appointment;
  viewer: 'PATIENT' | 'DOCTOR';
}) {
  const now = useNow();
  const { opensAt } = joinWindow(a);
  const note = canJoinNow(a, now)
    ? 'The consultation room is open now'
    : `The consultation room opens at ${formatTime(opensAt)}`;
  const day = formatDay(istDate(a.startAt));
  const who = whoFor(a, viewer);
  return (
    <Token
      day={day}
      time={formatTime(a.startAt)}
      who={who}
      note={note}
      accessibilityLabel={`Your appointment: ${day} at ${formatTime(a.startAt)} with ${who}. ${note}.`}
    />
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  leaf: {
    width: 64,
    alignSelf: 'flex-start', // a calendar page, not a column the height of the card
    paddingBottom: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: 'hidden',
    alignItems: 'center',
  },
  leafMonth: {
    backgroundColor: colors.primary,
    alignSelf: 'stretch',
    textAlign: 'center',
    paddingVertical: 2,
  },
  leafDay: { fontSize: 30, lineHeight: 40, fontWeight: '800', color: colors.primary },
});
