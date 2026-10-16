import { useState } from 'react';
import { router } from 'expo-router';
import { passwordProblem, type AuthSession } from '@telecare/shared';
import { api, session, useSession } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';
import { AppText, Banner, Button, Screen, TextField } from '@/ui';
import { ICONS } from '@/features/shell/icons';

export default function ChangePassword() {
  const state = useSession();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const { submit, busy, message, fields } = useSubmit(async () => {
    await session.adopt(
      await api.post<AuthSession>('/v1/auth/password/change', { currentPassword, newPassword }),
    );
    setDone(true);
  });

  if (done)
    return (
      <Screen>
        <Banner tone="success" message="Password changed. You have been logged out on your other devices." />
        <Button label="Done" icon={ICONS.check} onPress={() => router.back()} />
      </Screen>
    );

  function onSubmit() {
    const problems: Record<string, string> = {};
    if (!currentPassword) problems.currentPassword = 'Enter your current password';
    const weak = passwordProblem(newPassword, state.status === 'signedIn' ? state.user.phone : undefined);
    if (weak) problems.newPassword = weak;
    setLocal(problems);
    if (Object.keys(problems).length === 0) void submit();
  }

  return (
    <Screen>
      <AppText>Changing your password logs you out on all other devices.</AppText>
      {message && <Banner tone="danger" message={message} />}
      <TextField
        label="Current password"
        secret
        value={currentPassword}
        onChangeText={setCurrent}
        autoComplete="current-password"
        error={local.currentPassword ?? fields.currentPassword}
      />
      <TextField
        label="New password"
        secret
        value={newPassword}
        onChangeText={setNew}
        autoComplete="new-password"
        hint="At least 8 characters. Avoid common passwords."
        error={local.newPassword ?? fields.newPassword}
      />
      <Button label="Change password" icon={ICONS.lock} onPress={onSubmit} loading={busy} />
    </Screen>
  );
}
