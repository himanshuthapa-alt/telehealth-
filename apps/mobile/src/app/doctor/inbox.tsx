import {
  useDoctorUrgentRequests,
  useOnCallStatus,
  useRespondToUrgentRequest,
  useSetOnCallStatus,
} from '@/features/triage/urgent-queries';
import { AppText, Banner, Button, Card, EmptyState, QueryState, Screen, colors, spacing } from '@/ui';
import { SPECIALTY } from '@/features/doctors/specialties';
import { Switch, View } from 'react-native';

const formatArrival = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function DoctorUrgentInbox() {
  const onCall = useOnCallStatus();
  const inbox = useDoctorUrgentRequests();
  const setOnCall = useSetOnCallStatus();
  const respond = useRespondToUrgentRequest();

  return (
    <Screen>
      <AppText variant="title">Urgent inbox</AppText>
      <Banner
        tone="warning"
        message="Masked phone calls and push alerts are not configured. Accepting a request does not place a call."
      />
      <Card>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <View style={{ flex: 1, gap: spacing.xs }}>
            <AppText variant="label">On-call availability</AppText>
            <AppText color="textMuted">
              {onCall.data?.isOnCall
                ? 'You can receive urgent requests for your specialties.'
                : 'Turn this on only when you can respond promptly.'}
            </AppText>
          </View>
          <Switch
            accessibilityLabel="On-call availability"
            value={onCall.data?.isOnCall ?? false}
            disabled={!onCall.data || setOnCall.isPending}
            onValueChange={(value) => setOnCall.mutate(value)}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor={onCall.data?.isOnCall ? colors.primary : colors.textMuted}
          />
        </View>
        {onCall.isError && (
          <Banner
            tone="danger"
            message="Could not load your on-call status. Pull to refresh or reopen this screen."
          />
        )}
        {setOnCall.isError && (
          <Banner tone="danger" message="Could not update on-call status. Please try again." />
        )}
      </Card>

      <AppText variant="heading">Requests assigned to you</AppText>
      <AppText color="textMuted">
        Requests move to the next available doctor after three minutes without acceptance.
      </AppText>
      {respond.isSuccess && (
        <Banner
          tone="success"
          message={
            respond.data.status === 'ACCEPTED'
              ? 'Request accepted. Arrange patient contact through a configured channel; this build does not place calls.'
              : respond.data.status === 'EXHAUSTED'
                ? 'Request declined. No other on-call doctor is available.'
                : 'Request declined and sent to the next on-call doctor.'
          }
        />
      )}
      <QueryState
        query={inbox}
        isEmpty={(items) => items.length === 0}
        empty={
          <EmptyState
            title="No urgent requests waiting."
            body="Keep your on-call status current. New requests refresh automatically."
          />
        }
      >
        {(items) => (
          <View style={{ gap: spacing.md }}>
            {items.map(({ request, patientName }) => (
              <Card key={request.id}>
                <AppText variant="label">{patientName}</AppText>
                <AppText color="textMuted">
                  {SPECIALTY[request.recommendedSpecialization]?.plain ?? request.recommendedSpecialization} ·
                  received {formatArrival(request.createdAt)}
                </AppText>
                <AppText>{request.symptoms}</AppText>
                {request.language && (
                  <AppText variant="caption" color="textMuted">
                    Preferred language: {request.language}
                  </AppText>
                )}
                <Banner
                  tone="warning"
                  message="AI triage is a routing aid only. Assess the patient yourself; it is not a diagnosis."
                />
                {respond.isError && (
                  <Banner
                    tone="danger"
                    message="That request changed while you were responding. Refresh the inbox and try again."
                  />
                )}
                <Button
                  label="Accept request"
                  loading={
                    respond.isPending &&
                    respond.variables?.id === request.id &&
                    respond.variables.response === 'accept'
                  }
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ id: request.id, response: 'accept' })}
                />
                <Button
                  label="Decline and notify the next doctor"
                  variant="secondary"
                  loading={
                    respond.isPending &&
                    respond.variables?.id === request.id &&
                    respond.variables.response === 'decline'
                  }
                  disabled={respond.isPending}
                  onPress={() => respond.mutate({ id: request.id, response: 'decline' })}
                />
              </Card>
            ))}
          </View>
        )}
      </QueryState>
    </Screen>
  );
}
