import { useNetworkState } from 'expo-network';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { colors, radius, spacing } from './theme';

/** Shown on every screen while the phone has no connection (blueprint §17). */
export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetworkState();
  // Unknown (undefined) counts as online, so the banner never flashes on startup.
  if (isConnected !== false && isInternetReachable !== false) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.banner}>
      <Icon name={{ android: 'wifi_off', ios: 'wifi.slash' }} size={26} color="warning" />
      <AppText color="warning" style={{ flex: 1, fontWeight: '600' }}>
        {"You're offline. Showing saved information."}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
});
