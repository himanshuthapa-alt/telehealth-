import { useState } from 'react';
import { ProfileScreen } from '@/features/account/ProfileScreen';
import {
  DoctorFieldsForm,
  draftFromProfile,
  validateDoctorDraft,
  type DoctorFieldsDraft,
} from '@/features/doctor-account/DoctorFieldsForm';
import { useMyDoctorProfile, useUpdateDoctorProfile } from '@/features/doctor-account/queries';
import { ICONS } from '@/features/shell/icons';
import { useSubmit } from '@/lib/use-submit';
import { AppText, Banner, Button, Card, QueryState } from '@/ui';

/** Account details plus the public profile patients see when choosing a doctor. */
export default function DoctorProfile() {
  const query = useMyDoctorProfile();
  return (
    <ProfileScreen>
      <QueryState query={query}>
        {(profile) => <PublicProfileForm initial={draftFromProfile(profile)} />}
      </QueryState>
    </ProfileScreen>
  );
}

function PublicProfileForm({ initial }: { initial: DoctorFieldsDraft }) {
  const [draft, setDraft] = useState(initial);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const update = useUpdateDoctorProfile();
  const { submit, busy, message, fields } = useSubmit(async () => {
    const checked = validateDoctorDraft(draft);
    if (!checked.ok) return setLocal(checked.problems);
    setLocal({});
    await update.mutateAsync(checked.fields);
    setSaved(true);
  });

  return (
    <Card>
      <AppText variant="heading">Public profile</AppText>
      <AppText color="textMuted">Patients see this when choosing a doctor.</AppText>
      {message && <Banner tone="danger" message={message} />}
      {saved && <Banner tone="success" message="Saved." />}
      <DoctorFieldsForm
        value={draft}
        onChange={(d) => {
          setSaved(false);
          setDraft(d);
        }}
        error={(f) => local[f] ?? fields[f]}
      />
      <Button label="Save profile" icon={ICONS.check} loading={busy} onPress={() => void submit()} />
    </Card>
  );
}
