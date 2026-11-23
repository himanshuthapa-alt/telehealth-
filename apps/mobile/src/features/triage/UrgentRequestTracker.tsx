import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppText, Banner, Button, Card, colors } from '@/ui';
import { activeUrgentRequestKey, cancelUrgentRequest } from './urgent-api';
import { useUrgentRequest } from './urgent-queries';

export function UrgentRequestTracker({
  patientId,
  refreshSignal,
}: {
  patientId: string;
  refreshSignal: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState(false);
  const request = useUrgentRequest(requestId);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(activeUrgentRequestKey(patientId))
      .then((id) => {
        if (active) setRequestId(id);
      })
      .catch(() => {
        if (active) setRequestId(null);
      });
    return () => {
      active = false;
    };
  }, [patientId, refreshSignal]);

  const data = request.data;
  if (requestId && request.isError) {
    return (
      <Card>
        <Banner tone="warning" message="Could not refresh your urgent request status." />
        <Button label="Try again" variant="secondary" onPress={() => void request.refetch()} />
      </Card>
    );
  }
  if (!data) return null;

  const statusText = {
    PENDING: 'Waiting for an on-call doctor. No phone call has been placed.',
    ACCEPTED:
      'A doctor accepted the request. Masked phone calls are not configured, so no callback was placed.',
    EXHAUSTED:
      'No on-call doctor accepted in time. Book a regular appointment; call 112 or 108 for emergencies.',
    CANCELLED: 'This request was cancelled.',
  }[data.status];

  return (
    <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
      <AppText variant="label">Urgent doctor request</AppText>
      <AppText>{statusText}</AppText>
      {data.status === 'PENDING' && (
        <>
          <AppText variant="caption" color="textMuted">
            Status refreshes every 15 seconds while Home is open.
          </AppText>
          <Button
            label="Cancel request"
            variant="secondary"
            onPress={() => {
              setCancelError(false);
              void cancelUrgentRequest(data.id)
                .then(() => request.refetch())
                .catch(() => setCancelError(true));
            }}
          />
        </>
      )}
      {cancelError && <Banner tone="danger" message="Could not cancel the request. Please try again." />}
    </Card>
  );
}
