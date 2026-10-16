import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { normalizePhone } from '@telecare/shared';
import { session, useSession } from '@/lib/api';
import { ICONS } from '@/features/shell/icons';
import { useSubmit } from '@/lib/use-submit';
import { Banner, Button, Screen, TextField } from '@/ui';

export default function Login() {
  const state = useSession();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});
  const { submit, busy, message, fields } = useSubmit(() => session.login({ phone, password }));

  function onSubmit() {
    const problems: Record<string, string> = {};
    if (!normalizePhone(phone)) problems.phone = 'Enter your 10-digit mobile number';
    if (!password) problems.password = 'Enter your password';
    setLocal(problems);
    if (Object.keys(problems).length === 0) void submit();
  }

  return (
    <Screen>
      {state.status === 'signedOut' && state.expired && (
        <Banner tone="warning" message="Please log in again to continue." />
      )}
      {notice === 'reset' && (
        <Banner tone="success" message="Password changed. Log in with your new password." />
      )}
      {message && <Banner tone="danger" message={message} />}
      <TextField
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={local.phone ?? fields.phone}
      />
      <TextField
        label="Password"
        secret
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={onSubmit}
        error={local.password ?? fields.password}
      />
      <Button label="Log in" icon={ICONS.login} onPress={onSubmit} loading={busy} />
      <Button
        label="Forgot password?"
        variant="ghost"
        icon={ICONS.lock}
        onPress={() => router.push('/forgot-password')}
      />
    </Screen>
  );
}
