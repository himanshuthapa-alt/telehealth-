import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { DoctorDetail } from '@telecare/shared';
import { DemoBadge, Fact, plainSpecialties } from '@/features/doctors/DoctorCardView';
import { useDoctor } from '@/features/doctors/doctor-queries';
import { formatExperience, formatFee, formatRating } from '@/features/doctors/format';
import { ICONS } from '@/features/shell/icons';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Icon,
  QueryState,
  Screen,
  Skeleton,
  colors,
  radius,
  spacing,
} from '@/ui';

function Profile({ doctor }: { doctor: DoctorDetail }) {
  return (
    <>
      <Card style={styles.top}>
        <Avatar name={doctor.name} photoUrl={doctor.photoUrl} size={80} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="heading">{doctor.name}</AppText>
          <AppText color="primary" style={{ fontWeight: '600' }}>
            {plainSpecialties(doctor)}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {doctor.specializations.join(', ')}
          </AppText>
          <View style={styles.badges}>
            {doctor.isDemo ? (
              <DemoBadge />
            ) : (
              <View style={styles.verified}>
                <Icon name={ICONS.verified} size={16} color="success" />
                <AppText variant="caption" color="success" style={{ fontWeight: '700' }}>
                  Verified
                </AppText>
              </View>
            )}
          </View>
        </View>
      </Card>

      <Card>
        <View
          style={styles.fee}
          accessible
          accessibilityLabel={`Consultation fee: ${formatFee(doctor.feeInr)}`}
        >
          <AppText color="textMuted">Consultation fee</AppText>
          <AppText variant="title">{formatFee(doctor.feeInr)}</AppText>
        </View>
        <Fact icon={ICONS.language} text={`Speaks ${doctor.languages.join(', ')}`} />
        <Fact icon={ICONS.doctor} text={`${formatExperience(doctor.experienceYears)} experience`} />
        <Fact
          icon={ICONS.check}
          text={doctor.ratingAvg === null ? 'New doctor, no ratings yet' : `Rating ${formatRating(doctor)}`}
        />
        <Fact icon={ICONS.video} text="Consults by video call in this app" />
      </Card>

      {doctor.bio !== '' && (
        <Card>
          <AppText variant="label">About the doctor</AppText>
          <AppText>{doctor.bio}</AppText>
        </Card>
      )}

      <Button
        label="Book a consultation"
        icon={ICONS.calendar}
        onPress={() => router.push({ pathname: '/patient/doctors/slots', params: { doctorId: doctor.id } })}
      />
    </>
  );
}

export default function DoctorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doctor = useDoctor(id);
  return (
    <Screen>
      <QueryState query={doctor} loading={<Skeleton cards={2} />}>
        {(data) => <Profile doctor={data} />}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  badges: { flexDirection: 'row', marginTop: spacing.xs },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  fee: { gap: 0, marginBottom: spacing.xs },
});
