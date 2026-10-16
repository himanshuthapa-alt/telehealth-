import { useLocalSearchParams } from 'expo-router';
import { PrescriptionView } from '@/features/prescriptions/PrescriptionView';
import { usePrescription } from '@/features/prescriptions/prescription-queries';
import { ICONS } from '@/features/shell/icons';
import { AppText, Button, QueryState, Screen, Skeleton } from '@/ui';

export default function PatientPrescription() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const prescription = usePrescription(id);
  return (
    <Screen>
      <QueryState query={prescription} loading={<Skeleton cards={3} />}>
        {(p) => (
          <>
            <PrescriptionView prescription={p} />
            {p.status === 'ISSUED' && (
              <>
                {/* Phase 8 turns this into the order builder. */}
                <Button
                  label="Order these medicines"
                  icon={ICONS.medicines}
                  disabled
                  onPress={() => undefined}
                />
                <AppText color="textMuted" style={{ textAlign: 'center' }}>
                  Ordering from the TeleCare+ pharmacy opens in the next update.
                </AppText>
              </>
            )}
          </>
        )}
      </QueryState>
    </Screen>
  );
}
