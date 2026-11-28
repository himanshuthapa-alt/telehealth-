import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, View } from 'react-native';
import {
  HMSConfig,
  HMSSDK,
  HMSTrackType,
  HMSTrackUpdate,
  HMSUpdateListenerActions,
  HMSVideoViewMode,
  type HMSException,
  type HMSPeer,
  type HMSTrack,
} from '@100mslive/react-native-hms';
import type { VideoAccess } from '@telecare/shared';
import { AppText, Button, colors, radius, spacing } from '@/ui';

type Phase = 'connecting' | 'in' | 'failed';

async function permissionsGranted() {
  if (Platform.OS !== 'android') return true; // iOS asks on first use (Info.plist strings)
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

/**
 * A real two-person video call over 100ms. The room and token come from our API
 * (POST /join); this only renders the call. If it can't connect, the chat below
 * still works and the server is told, so the consultation carries on as chat.
 */
export function HmsCall({
  video,
  name,
  onFailed,
}: {
  video: VideoAccess;
  name: string;
  onFailed: () => void;
}) {
  const [hms, setHms] = useState<HMSSDK | null>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [problem, setProblem] = useState('');
  const [localId, setLocalId] = useState<string>();
  const [remoteId, setRemoteId] = useState<string>();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const onFailedRef = useRef(onFailed);
  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  useEffect(() => {
    let cancelled = false;
    let instance: HMSSDK | null = null;
    const fail = (message: string) => {
      if (cancelled) return;
      setProblem(message);
      setPhase('failed');
      onFailedRef.current();
    };

    void (async () => {
      if (!(await permissionsGranted()))
        return fail('Camera and microphone are needed for video. Allow them in Settings, or use the chat.');
      const hms = await HMSSDK.build();
      if (cancelled) return void hms.destroy();
      instance = hms;
      setHms(hms);

      hms.addEventListener(HMSUpdateListenerActions.ON_JOIN, async () => {
        const me = await hms.getLocalPeer();
        if (!cancelled) {
          setLocalId(me.localVideoTrack()?.trackId);
          setPhase('in');
        }
      });
      hms.addEventListener(
        HMSUpdateListenerActions.ON_TRACK_UPDATE,
        ({ peer, track, type }: { peer: HMSPeer; track: HMSTrack; type: HMSTrackUpdate }) => {
          if (track.type !== HMSTrackType.VIDEO || cancelled) return;
          const set = peer.isLocal ? setLocalId : setRemoteId;
          if (type === HMSTrackUpdate.TRACK_ADDED) set(track.trackId);
          if (type === HMSTrackUpdate.TRACK_REMOVED) set(undefined);
        },
      );
      hms.addEventListener(HMSUpdateListenerActions.ON_ERROR, (error: HMSException) => {
        // Non-terminal errors (a brief network blip) are retried by the SDK itself.
        if (error.isTerminal) fail(`Video stopped: ${error.description}. Use the chat below.`);
      });

      await hms.join(new HMSConfig({ authToken: video.token, username: name }));
    })().catch((err: Error) => fail(`Could not start video: ${err.message}. Use the chat below.`));

    return () => {
      cancelled = true;
      const hms = instance;
      if (hms) void hms.leave().finally(() => void hms.destroy());
    };
  }, [video.token, name]);

  async function toggleMic() {
    const me = await hms?.getLocalPeer();
    me?.localAudioTrack()?.setMute(micOn);
    setMicOn(!micOn);
  }
  async function toggleCam() {
    const me = await hms?.getLocalPeer();
    me?.localVideoTrack()?.setMute(camOn);
    setCamOn(!camOn);
  }
  async function flip() {
    const me = await hms?.getLocalPeer();
    me?.localVideoTrack()?.switchCamera();
  }

  const HmsView = hms?.HmsView;

  if (phase === 'failed')
    return (
      <View style={[styles.stage, styles.center]}>
        <AppText color="onPrimary">{problem}</AppText>
      </View>
    );

  return (
    <View style={styles.wrap}>
      <View style={styles.stage} accessible accessibilityLabel="Video call">
        {HmsView && remoteId ? (
          <HmsView trackId={remoteId} style={styles.full} scaleType={HMSVideoViewMode.ASPECT_FILL} />
        ) : (
          <View style={styles.center}>
            <AppText color="onPrimary">
              {phase === 'connecting' ? 'Connecting video…' : 'Waiting for the other person’s video…'}
            </AppText>
          </View>
        )}
        {HmsView && localId && camOn && (
          <HmsView trackId={localId} mirror style={styles.self} scaleType={HMSVideoViewMode.ASPECT_FILL} />
        )}
      </View>
      <View style={styles.controls}>
        <Button
          label={micOn ? 'Mute' : 'Unmute'}
          variant="secondary"
          icon={micOn ? { android: 'mic', ios: 'mic' } : { android: 'mic_off', ios: 'mic.slash' }}
          onPress={() => void toggleMic()}
        />
        <Button
          label={camOn ? 'Camera off' : 'Camera on'}
          variant="secondary"
          icon={
            camOn ? { android: 'videocam', ios: 'video' } : { android: 'videocam_off', ios: 'video.slash' }
          }
          onPress={() => void toggleCam()}
        />
        <Button
          label="Flip"
          variant="ghost"
          icon={{ android: 'cameraswitch', ios: 'arrow.triangle.2.circlepath.camera' }}
          onPress={() => void flip()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  stage: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  full: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  self: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 96,
    height: 128,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
