import { useState } from 'react';
import { ICONS } from '@/features/shell/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { GENDERS, LANGUAGES, type PatientProfile } from '@telecare/shared';
import { GENDER_LABEL, formatDay, parseDay, toDay } from '@/features/account/format';
import { usePatientProfile, useUpdatePatientProfile } from '@/features/account/profile-queries';
import { errorMessage, fieldErrors } from '@/lib/errors';
import {
  AppText,
  Banner,
  Button,
  Chip,
  QueryState,
  Screen,
  TextField,
  colors,
  minTouchTarget,
  radius,
  spacing,
} from '@/ui';

const OLDEST = new Date(new Date().getFullYear() - 120, 0, 1);

function EditForm({ profile }: { profile: PatientProfile }) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth);
  const [gender, setGender] = useState(profile.gender);
  const [language, setLanguage] = useState(profile.preferredLanguage);
  const [district, setDistrict] = useState(profile.district ?? '');
  const [picking, setPicking] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const save = useUpdatePatientProfile();
  const fields = fieldErrors(save.error);

  function onSave() {
    const name = fullName.trim();
    setNameError(name.length < 2 ? 'Enter your full name' : undefined);
    if (name.length < 2) return;
    save.mutate(
      { fullName: name, dateOfBirth, gender, preferredLanguage: language, district: district.trim() || null },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <>
      {save.error && <Banner tone="danger" message={errorMessage(save.error)} />}
      <TextField
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
        error={nameError ?? fields.fullName}
      />

      <View style={styles.group}>
        <AppText variant="label">Date of birth</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Date of birth: ${dateOfBirth ? formatDay(parseDay(dateOfBirth)) : 'not added'}. Change`}
          onPress={() => setPicking(true)}
          style={styles.dateButton}
        >
          <AppText color={dateOfBirth ? 'text' : 'textDisabled'}>
            {dateOfBirth ? formatDay(parseDay(dateOfBirth)) : 'Choose a date'}
          </AppText>
        </Pressable>
        {fields.dateOfBirth && (
          <AppText variant="small" color="danger">
            {fields.dateOfBirth}
          </AppText>
        )}
        {picking && (
          <DateTimePicker
            value={dateOfBirth ? parseDay(dateOfBirth) : new Date(1990, 0, 1)}
            minimumDate={OLDEST}
            maximumDate={new Date()}
            accentColor={colors.primary}
            onValueChange={(_event, date) => {
              setPicking(false);
              setDateOfBirth(toDay(date));
            }}
            onDismiss={() => setPicking(false)}
          />
        )}
      </View>

      <View style={styles.group}>
        <AppText variant="label">Gender</AppText>
        <View style={styles.chips}>
          {GENDERS.map((g) => (
            <Chip
              key={g}
              label={GENDER_LABEL[g]}
              selected={gender === g}
              onPress={() => setGender(gender === g ? null : g)}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <AppText variant="label">Preferred language</AppText>
        <AppText variant="small" color="textMuted">
          Helps us show doctors who speak it.
        </AppText>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => (
            <Chip
              key={l}
              label={l}
              selected={language === l}
              onPress={() => setLanguage(language === l ? null : l)}
            />
          ))}
        </View>
      </View>

      <TextField
        label="District"
        value={district}
        onChangeText={setDistrict}
        autoComplete="postal-address-region"
        error={fields.district}
      />

      <Button label="Save my details" icon={ICONS.check} onPress={onSave} loading={save.isPending} />
    </>
  );
}

export default function EditProfile() {
  const profile = usePatientProfile();
  return (
    <Screen>
      <QueryState query={profile}>{(data) => <EditForm profile={data} />}</QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dateButton: {
    minHeight: minTouchTarget + 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
