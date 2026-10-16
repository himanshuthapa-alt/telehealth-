import { useState } from 'react';
import { router } from 'expo-router';
import { normalizePhone } from '@telecare/shared';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';
import { AppText, Banner, Button, Screen, TextField } from '@/ui';

export default function ForgotPassword() {
  const [phone, setPhone] = useState('');
  const [local, setLocal] = useState<string>();
  const { submit, busy, message, fields } = useSubmit(async (normalized: string) => {
    await api.post('/v1/auth/password/forgot', { phone: normalized });
    router.push({ pathname: '/reset-password', params: { phone: normalized } });
  });

  function onSubmit() {
    const normalized = normalizePhone(phone);
    setLocal(normalized ? undefined : 'Enter your 10-digit mobile number');
    if (normalized) void submit(normalized);
  }

  return (
    <Screen>
      <AppText>Enter the mobile number you registered with. We will send you a 6-digit code.</AppText>
      {message && <Banner tone="danger" message={message} />}
      <TextField
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={local ?? fields.phone}
      />
      <Button
        label="Send me a code"
        icon={{ android: 'sms', ios: 'message' }}
        onPress={onSubmit}
        loading={busy}
      />
    </Screen>
  );
}
