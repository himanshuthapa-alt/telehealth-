import type { VideoAccess } from '@telecare/shared';
import { Banner } from '@/ui';

/** The 100ms SDK in this app is native-only; on the web the consultation runs in the chat. */
export function HmsCall(_props: { video: VideoAccess; name: string; onFailed: () => void }) {
  return <Banner tone="info" message="Video calls work in the phone app. Use the chat below." />;
}
