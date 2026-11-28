import { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { VideoAccess } from '@telecare/shared';
import { AppText, Banner, colors, radius } from '@/ui';
import { callPageUrl, callUrl } from './call-url';

/**
 * A video call shown in a web view: our direct (P2P) call page or Daily Prebuilt.
 * The P2P page is loaded as HTML with a localhost base, because browsers only
 * allow the camera on secure (https or localhost) pages, and a phone on the
 * same Wi-Fi reaches the API over plain http.
 */
export function WebCall({ video, onFailed }: { video: VideoAccess; name: string; onFailed: () => void }) {
  const [allowed, setAllowed] = useState<boolean | null>(Platform.OS === 'android' ? null : true);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (video.provider !== 'p2p') return;
    fetch(callPageUrl())
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      // Hand the page its token in memory (never in a URL). '<' is escaped so the token can't end the script.
      .then((page) =>
        setHtml(
          page.replace(
            '<head>',
            `<head><script>window.__CALL_TOKEN__=${JSON.stringify(video.token).replace(/</g, '\\u003c')}</script>`,
          ),
        ),
      )
      .catch(onFailed);
  }, [video, onFailed]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ])
      .then((r) => setAllowed(Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED)))
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === false)
    return (
      <Banner
        tone="warning"
        message="Allow camera and microphone in Settings to use video. The chat below still works."
      />
    );
  if (allowed === null || (video.provider === 'p2p' && html === null))
    return <AppText color="textMuted">Connecting the video…</AppText>;

  return (
    <View style={styles.frame}>
      <WebView
        source={html !== null ? { html, baseUrl: 'http://localhost' } : { uri: callUrl(video) }}
        style={styles.web}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        onError={onFailed}
        accessibilityLabel="Video call"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 420, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.text },
  web: { flex: 1, backgroundColor: colors.text },
});
