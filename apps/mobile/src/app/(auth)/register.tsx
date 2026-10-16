import { useState } from 'react';
import { normalizePhone, passwordProblem } from '@telecare/shared';
import { session } from '@/lib/api';
import { PRIVACY_NOTICE } from '@/features/account/privacy';
import { ICONS } from '@/features/shell/icons';
import { useSubmit } from '@/lib/use-submit';
import { AppText, Banner, Button, Card, Checkbox, Screen, TextField } from '@/ui';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const { submit, busy, message, fields } = useSubmit(() =>
    session.register({ fullName: fullName.trim(), phone, password, consent: true }),
  );

  function onSubmit() {
    const problems: Record<string, string> = {};
    const normalized = normalizePhone(phone);
    if (fullName.trim().length < 2) problems.fullName = 'Enter your full name';
    if (!normalized) problems.phone = 'Enter a valid 10-digit mobile number';
    const weak = passwordProblem(password, normalized ?? undefined);
    if (weak) problems.password = weak;
    if (!consent) problems.consent = 'Please accept the privacy notice to continue';
    setLocal(problems);
    if (Object.keys(problems).length === 0) void submit();
  }

  const error = (field: string) => local[field] ?? fields[field];

  return (
    <Screen>
      {message && <Banner tone="danger" message={message} />}
      <TextField
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        textContentType="name"
        error={error('fullName')}
      />
      <TextField
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={error('phone')}
      />
      <TextField
        label="Password"
        secret
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        hint="At least 8 characters. Avoid common passwords."
        error={error('password')}
      />
      <Card>
        <AppText variant="label">Privacy notice</AppText>
        <AppText variant="small">{PRIVACY_NOTICE}</AppText>
      </Card>
      <Checkbox
        checked={consent}
        onChange={setConsent}
        label="I have read and accept the privacy notice"
        error={error('consent')}
      />
      <Button label="Create my account" icon={ICONS.newAccount} onPress={onSubmit} loading={busy} />
    </Screen>
  );
}
