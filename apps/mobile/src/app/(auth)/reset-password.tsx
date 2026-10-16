import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { passwordProblem } from '@telecare/shared';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';
import { AppText, Banner, Button, Screen, TextField } from '@/ui';
import { ICONS } from '@/features/shell/icons';

export default function ResetPassword() {
  const { phone = '' } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});
  const { submit, busy, message, fields } = useSubmit(async () => {
    await api.post('/v1/auth/password/reset', { phone, code, newPassword });
    router.dismissAll();
    router.replace({ pathname: '/login', params: { notice: 'reset' } });
  });

  function onSubmit() {
    const problems: Record<string, string> = {};
    if (!/^\d{6}$/.test(code)) problems.code = 'Enter the 6-digit code';
    const weak = passwordProblem(newPassword, phone);
    if (weak) problems.newPassword = weak;
    setLocal(problems);
    if (Object.keys(problems).length === 0) void submit();
  }

  return (
    <Screen>
      <AppText>If {phone} has an account, a 6-digit code is on its way. It works for 10 minutes.</AppText>
      {message && <Banner tone="danger" message={message} />}
      <TextField
        label="6-digit code"
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        error={local.code ?? fields.code}
      />
      <TextField
        label="New password"
        secret
        value={newPassword}
        onChangeText={setNewPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        hint="At least 8 characters. Avoid common passwords."
        error={local.newPassword ?? fields.newPassword}
      />
      <Button label="Set new password" icon={ICONS.lock} onPress={onSubmit} loading={busy} />
      <Button
        label="Send a new code"
        variant="ghost"
        icon={{ android: 'refresh', ios: 'arrow.clockwise' }}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
