import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  LANGUAGES,
  SPECIALIZATIONS,
  type DoctorProfileFields,
  type Language,
  type Specialization,
} from '@telecare/shared';
import { AppText, Chip, TextField, spacing } from '@/ui';

/** Form state for the doctor-editable fields; numbers stay strings while typing. */
export interface DoctorFieldsDraft {
  qualification: string;
  specializations: Specialization[];
  languages: Language[];
  experienceYears: string;
  feeInr: string;
  bio: string;
}

export const emptyDoctorDraft: DoctorFieldsDraft = {
  qualification: '',
  specializations: [],
  languages: [],
  experienceYears: '',
  feeInr: '',
  bio: '',
};

export const draftFromProfile = (p: DoctorProfileFields): DoctorFieldsDraft => ({
  ...p,
  experienceYears: String(p.experienceYears),
  feeInr: String(p.feeInr),
});

const wholeNumber = (text: string) => (/^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : null);

/** Checks the draft. Returns the API fields, or the per-field problems to show. */
export function validateDoctorDraft(
  d: DoctorFieldsDraft,
): { ok: true; fields: DoctorProfileFields } | { ok: false; problems: Record<string, string> } {
  const problems: Record<string, string> = {};
  const experienceYears = wholeNumber(d.experienceYears);
  const feeInr = wholeNumber(d.feeInr);
  if (d.qualification.trim().length < 2) problems.qualification = 'Enter your qualification, e.g. MBBS, MD';
  if (!d.specializations.length) problems.specializations = 'Choose at least one specialization';
  if (!d.languages.length) problems.languages = 'Choose at least one language';
  if (experienceYears === null || experienceYears > 70) problems.experienceYears = 'Enter years, 0 to 70';
  if (feeInr === null || feeInr > 100_000) problems.feeInr = 'Enter the fee in rupees';
  if (Object.keys(problems).length || experienceYears === null || feeInr === null)
    return { ok: false, problems };
  return {
    ok: true,
    fields: {
      qualification: d.qualification.trim(),
      specializations: d.specializations,
      languages: d.languages,
      experienceYears,
      feeInr,
      bio: d.bio.trim(),
    },
  };
}

const toggle = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

/** Specializations, languages, experience, fee and bio. Used at sign-up and on the doctor's Profile tab. */
export function DoctorFieldsForm({
  value,
  onChange,
  error,
}: {
  value: DoctorFieldsDraft;
  onChange: (next: DoctorFieldsDraft) => void;
  error: (field: string) => string | undefined;
}) {
  const set = <K extends keyof DoctorFieldsDraft>(key: K, v: DoctorFieldsDraft[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <>
      <TextField
        label="Qualification"
        value={value.qualification}
        onChangeText={(t) => set('qualification', t)}
        placeholder="MBBS, MD (Paediatrics)"
        hint="Printed on your prescriptions."
        maxLength={120}
        error={error('qualification')}
      />
      <ChipGroup
        label="Specializations"
        options={SPECIALIZATIONS}
        selected={value.specializations}
        onToggle={(s) => set('specializations', toggle(value.specializations, s))}
        error={error('specializations')}
      />
      <ChipGroup
        label="Languages you consult in"
        options={LANGUAGES}
        selected={value.languages}
        onToggle={(l) => set('languages', toggle(value.languages, l))}
        error={error('languages')}
      />
      <TextField
        label="Years of experience"
        value={value.experienceYears}
        onChangeText={(t) => set('experienceYears', t)}
        keyboardType="number-pad"
        error={error('experienceYears')}
      />
      <TextField
        label="Consultation fee (₹)"
        value={value.feeInr}
        onChangeText={(t) => set('feeInr', t)}
        keyboardType="number-pad"
        error={error('feeInr')}
      />
      <TextField
        label="About you (optional)"
        value={value.bio}
        onChangeText={(t) => set('bio', t)}
        multiline
        maxLength={1000}
        hint="Patients see this on your profile."
        error={error('bio')}
      />
    </>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
  error,
}: {
  label: string;
  options: readonly T[];
  selected: T[];
  onToggle: (item: T) => void;
  error?: string;
}) {
  const [showAll, setShowAll] = useState(options.length <= 8);
  const shown = showAll ? options : options.filter((o, i) => i < 6 || selected.includes(o));
  return (
    <View style={styles.group}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.chips}>
        {shown.map((o) => (
          <Chip key={o} label={o} selected={selected.includes(o)} onPress={() => onToggle(o)} />
        ))}
        {!showAll && <Chip label="More…" onPress={() => setShowAll(true)} />}
      </View>
      {error && (
        <AppText variant="small" color="danger">
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
