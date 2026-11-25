import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ICONS } from '@/features/shell/icons';
import { session } from '@/lib/api';
import { resolveApiBaseUrl, setStoredApiBaseUrl } from '@/lib/config';
import { AppText, Button, Icon, Screen, TextField, colors, radius, spacing } from '@/ui';

// A real sequence, so the steps are numbered.
const STEPS = [
  { icon: ICONS.doctor, text: 'Choose a doctor who speaks your language' },
  { icon: ICONS.video, text: 'Talk to them by video from home' },
  { icon: ICONS.medicines, text: 'Get your medicines delivered' },
];

export default function Welcome() {
  return (
    <Screen edges={['top']}>
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Icon name={ICONS.doctor} size={40} color="onAccent" />
        </View>
        <AppText variant="title">TeleCare+</AppText>
        <AppText style={styles.promise}>See a doctor without the long journey.</AppText>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          <View key={step.text} style={styles.step}>
            <View style={styles.stepIcon}>
              <Icon name={step.icon} size={30} color="primary" />
            </View>
            <AppText variant="label" style={{ flex: 1 }}>
              {i + 1}. {step.text}
            </AppText>
          </View>
        ))}
      </View>

      <Button label="I am new here" icon={ICONS.newAccount} onPress={() => router.push('/register')} />
      <Button
        label="I already have an account"
        variant="secondary"
        icon={ICONS.login}
        onPress={() => router.push('/login')}
      />

      <ServerSetting />
    </Screen>
  );
}

/**
 * Lets the user point the app at the current server URL (e.g. a changed tunnel
 * address) without needing a new build. Collapsed by default so it stays out of
 * the way for everyone else.
 */
function ServerSetting() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(resolveApiBaseUrl);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const before = resolveApiBaseUrl();
    const ok = await setStoredApiBaseUrl(url);
    if (!ok) {
      setError('Enter a valid http:// or https:// address');
      setSaved(false);
      return;
    }
    // Host changed: drop any logged-in session so a token is never sent to a new server.
    if (resolveApiBaseUrl() !== before) await session.logout().catch(() => undefined);
    setError('');
    setSaved(true);
  };

  if (!open) {
    return (
      <View style={styles.serverRow}>
        <AppText variant="caption" color="textMuted" onPress={() => setOpen(true)}>
          Server settings
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.serverBox}>
      <TextField
        label="Server URL"
        value={url}
        onChangeText={(t) => {
          setUrl(t);
          setSaved(false);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={error || undefined}
        hint={saved ? 'Saved. It applies on your next action.' : 'e.g. https://xxxx.trycloudflare.com'}
      />
      <Button label="Save server" onPress={() => void save()} />
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.md },
  mark: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promise: { fontSize: 22, lineHeight: 30, color: colors.textMuted },
  steps: { gap: spacing.md, paddingVertical: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverRow: { alignItems: 'center', paddingTop: spacing.md },
  serverBox: { gap: spacing.sm, paddingTop: spacing.md },
});
