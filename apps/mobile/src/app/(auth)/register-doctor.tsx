import { useState } from 'react';
import { normalizePhone, passwordProblem } from '@telecare/shared';
import { PRIVACY_NOTICE } from '@/features/account/privacy';
import {
  DoctorFieldsForm,
  emptyDoctorDraft,
  validateDoctorDraft,
} from '@/features/doctor-account/DoctorFieldsForm';
import { ICONS } from '@/features/shell/icons';
import { session } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';
import { AppText, Banner, Button, Card, Checkbox, Screen, TextField } from '@/ui';

/** Doctor sign-up. The account works at once, but patients only see the doctor after an admin approves. */
export default function RegisterDoctor() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [draft, setDraft] = useState(emptyDoctorDraft);
  const [consent, setConsent] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const { submit, busy, message, fields } = useSubmit(session.registerDoctor);

  function onSubmit() {
    const checked = validateDoctorDraft(draft);
    const problems: Record<string, string> = checked.ok ? {} : { ...checked.problems };
    const normalized = normalizePhone(phone);
    if (fullName.trim().length < 2) problems.fullName = 'Enter your full name';
    if (!normalized) problems.phone = 'Enter a valid 10-digit mobile number';
    const weak = passwordProblem(password, normalized ?? undefined);
    if (weak) problems.password = weak;
    if (!/^[A-Za-z0-9/-]{3,30}$/.test(registrationNumber.trim()))
      problems.registrationNumber = 'Enter your medical council registration number';
    if (!consent) problems.consent = 'Please accept the privacy notice to continue';
    setLocal(problems);
    if (!checked.ok || Object.keys(problems).length) return;
    void submit({
      fullName: fullName.trim(),
      phone,
      password,
      registrationNumber: registrationNumber.trim(),
      consent: true,
      ...checked.fields,
    });
  }

  const error = (field: string) => local[field] ?? fields[field];

  return (
    <Screen>
      <Banner
        tone="info"
        message="We check your registration number before patients can find and book you. This usually takes a day."
      />
      {message && <Banner tone="danger" message={message} />}
      <TextField
        label="Full name (as registered)"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        placeholder="Dr. …"
        error={error('fullName')}
      />
      <TextField
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={error('phone')}
      />
      <TextField
        label="Password"
        secret
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        hint="At least 8 characters. Avoid common passwords."
        error={error('password')}
      />
      <TextField
        label="Medical council registration number"
        value={registrationNumber}
        onChangeText={setRegistrationNumber}
        autoCapitalize="characters"
        hint="From your State Medical Council or NMC certificate. Only our admin team sees it."
        error={error('registrationNumber')}
      />
      <DoctorFieldsForm value={draft} onChange={setDraft} error={error} />
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
      <Button label="Create doctor account" icon={ICONS.doctor} onPress={onSubmit} loading={busy} />
    </Screen>
  );
}
