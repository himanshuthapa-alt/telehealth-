import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { PrescriptionView } from '@/features/prescriptions/PrescriptionView';
import { usePrescription } from '@/features/prescriptions/prescription-queries';
import { ICONS } from '@/features/shell/icons';
import { VoiceOrderModal } from '@/features/voice/VoiceOrderModal';
import { Button, QueryState, Screen, Skeleton } from '@/ui';

export default function PatientPrescription() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const prescription = usePrescription(id);
  const [voiceOrder, setVoiceOrder] = useState(false);
  return (
    <Screen>
      <QueryState query={prescription} loading={<Skeleton cards={3} />}>
        {(p) => (
          <>
            <PrescriptionView prescription={p} />
            {p.status === 'ISSUED' && (
              <>
                <Button
                  label="Order by voice (yes / no)"
                  icon={ICONS.mic}
                  onPress={() => setVoiceOrder(true)}
                />
                <Button
                  label="Order these medicines"
                  variant="secondary"
                  icon={ICONS.medicines}
                  onPress={() =>
                    router.push({
                      pathname: '/patient/medicines/order-builder',
                      params: { prescriptionId: p.id },
                    })
                  }
                />
                <VoiceOrderModal visible={voiceOrder} onClose={() => setVoiceOrder(false)} prescription={p} />
              </>
            )}
          </>
        )}
      </QueryState>
    </Screen>
  );
}
