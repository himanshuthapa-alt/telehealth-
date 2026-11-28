import type { VideoAccess } from '@telecare/shared';
import { resolveApiBaseUrl } from '@/lib/config';

/** Where the call page lives: our own API (free direct video) or Daily's ready-made screen. */
export const callUrl = (video: VideoAccess) =>
  video.provider === 'p2p'
    ? `${resolveApiBaseUrl()}/v1/rtc/call?t=${encodeURIComponent(video.token)}`
    : `${video.roomId}?t=${encodeURIComponent(video.token)}`;
