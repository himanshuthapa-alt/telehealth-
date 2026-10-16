import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from './AppText';
import { colors, radius } from './theme';

/** Photo if there is one, otherwise initials (blueprint §17: small images, initials fallback). */
export function Avatar({
  name,
  photoUrl,
  size = 56,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const box = { width: size, height: size, borderRadius: radius.pill };
  if (photoUrl)
    return <Image source={photoUrl} style={box} accessibilityIgnoresInvertColors contentFit="cover" />;
  return (
    <View style={[styles.initials, box]} importantForAccessibility="no-hide-descendants">
      <AppText variant="label" color="primary" style={{ fontSize: size * 0.36 }}>
        {initials}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  initials: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
