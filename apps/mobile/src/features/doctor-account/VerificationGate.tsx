import type { ReactNode } from 'react';
import { session } from '@/lib/api';
import { AppText, Banner, Button, Card, QueryState, Screen } from '@/ui';
import { useMyDoctorProfile } from './queries';

/** Shows the doctor's tabs only once an admin has approved them; until then, where they stand. */
export function VerificationGate({ children }: { children: ReactNode }) {
  const query = useMyDoctorProfile();
  if (query.data?.verificationStatus === 'APPROVED') return children;

  return (
    <Screen edges={['top']}>
      <QueryState query={query}>
        {(profile) => (
          <>
            <AppText variant="title">
              {profile.verificationStatus === 'PENDING' ? 'Awaiting approval' : 'Not approved'}
            </AppText>
            {profile.verificationStatus === 'PENDING' ? (
              <Banner
                tone="info"
                message="Our team is checking your registration number. Patients will find you as soon as you are approved."
              />
            ) : (
              <Banner
                tone="danger"
                message={profile.verificationNote ?? 'Your registration could not be verified.'}
              />
            )}
            <Card>
              <AppText variant="label">{profile.fullName}</AppText>
              <AppText color="textMuted">Registration no. {profile.registrationNumber ?? '—'}</AppText>
              <AppText color="textMuted">{profile.specializations.join(', ')}</AppText>
            </Card>
            <Button
              label="Check again"
              variant="secondary"
              loading={query.isFetching}
              onPress={() => void query.refetch()}
            />
            <Button label="Log out" variant="ghost" onPress={() => void session.logout()} />
          </>
        )}
      </QueryState>
    </Screen>
  );
}
