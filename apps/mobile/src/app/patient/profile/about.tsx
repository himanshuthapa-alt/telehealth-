import Constants from 'expo-constants';
import { PRIVACY_NOTICE } from '@/features/account/privacy';
import { usePatientProfile } from '@/features/account/profile-queries';
import { AppText, Card, Screen } from '@/ui';

export default function About() {
  const consentAt = usePatientProfile().data?.consentAt;
  return (
    <Screen>
      <Card>
        <AppText variant="heading">TeleCare+</AppText>
        <AppText>
          Connects you with doctors by video and delivers the medicines they prescribe. TeleCare+ does not
          diagnose or suggest medicines; your doctor decides your treatment.
        </AppText>
        <AppText variant="caption" color="textMuted">
          Version {Constants.expoConfig?.version ?? 'unknown'}
        </AppText>
      </Card>
      <Card>
        <AppText variant="heading">Privacy notice</AppText>
        <AppText>{PRIVACY_NOTICE}</AppText>
        <AppText variant="small" color="textMuted">
          {"Designed with reference to the principles of India's Digital Personal Data Protection Act."}
        </AppText>
        {consentAt && (
          <AppText variant="small" color="textMuted">
            You accepted this notice on{' '}
            {new Date(consentAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.
          </AppText>
        )}
      </Card>
    </Screen>
  );
}
