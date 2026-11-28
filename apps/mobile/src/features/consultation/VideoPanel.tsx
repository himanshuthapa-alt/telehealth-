import { StyleSheet, View } from 'react-native';
import type { VideoAccess } from '@telecare/shared';
import { ICONS } from '@/features/shell/icons';
import { AppText, Icon, colors, radius, spacing } from '@/ui';
import { HmsCall } from './HmsCall';

/**
 * Where the video call shows (blueprint §13.2: one client component for any
 * provider). 100ms rooms get a real call; demo and chat-only modes say honestly
 * what is happening instead of pretending.
 */
export function VideoPanel({
  video,
  name,
  onVideoFailed,
}: {
  video: VideoAccess | null;
  /** Shown to the other person in the call. */
  name: string;
  onVideoFailed: () => void;
}) {
  if (video?.provider === 'hms') return <HmsCall video={video} name={name} onFailed={onVideoFailed} />;
  const demo = video?.provider === 'fake';
  return (
    <View
      style={styles.panel}
      accessible
      accessibilityLabel={demo ? 'Video demo mode. Use the chat below.' : 'Chat only. Use the chat below.'}
    >
      <Icon name={demo ? ICONS.video : ICONS.chat} size={36} color="onPrimary" />
      <View style={{ flex: 1 }}>
        <AppText variant="label" color="onPrimary">
          {demo ? 'Video demo mode' : 'Chat consultation'}
        </AppText>
        <AppText variant="small" color="onPrimary">
          {demo
            ? 'Real video arrives when a video service is connected. Talk using the chat below.'
            : 'This consultation happens in the chat below.'}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
});
