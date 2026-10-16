import { View } from 'react-native';
import { istDate, type Prescription } from '@telecare/shared';
import { formatDay } from '@/features/appointments/format';
import { AppText, Banner, Card, Icon, spacing } from '@/ui';
import { MedicineDose } from './MedicineDose';
import { prescriptionState } from './PrescriptionCard';

/** "today", "yesterday" or "on Tue 8 Jan". */
function writtenOn(issuedAt: string): string {
  const day = formatDay(istDate(issuedAt));
  return day === 'Today' ? 'today' : `on ${day}`;
}

/** The full prescription, read-only. Used by the patient and by the doctor after issue. */
export function PrescriptionView({ prescription: p }: { prescription: Prescription }) {
  const state = prescriptionState(p);
  return (
    <>
      <Card>
        <AppText variant="heading">{p.doctor.name}</AppText>
        <AppText color="textMuted">
          For {p.patient.name}
          {p.patient.age !== null ? `, ${p.patient.age} years` : ''}
        </AppText>
        {p.issuedAt && <AppText>Written {writtenOn(p.issuedAt)}</AppText>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Icon name={state.icon} size={22} color={state.tone} />
          <AppText variant="label" color={state.tone}>
            {state.label}
          </AppText>
        </View>
      </Card>
      {p.status === 'VOIDED' && (
        <Banner
          tone="danger"
          message={`The doctor withdrew this prescription${p.voidReason ? `: ${p.voidReason}.` : '.'} Do not use it.`}
        />
      )}
      {p.items.map((item, i) => (
        <MedicineDose key={item.id} item={item} index={i} />
      ))}
      {p.generalInstructions && (
        <Card>
          <AppText variant="label">{"Doctor's advice"}</AppText>
          <AppText>{p.generalInstructions}</AppText>
        </Card>
      )}
    </>
  );
}
