import type { VideoAccess } from '@telecare/shared';
import { resolveApiBaseUrl } from '@/lib/config';

/** The call page lives at our API (no secret in it), so the token goes separately. */
export const callPageUrl = () => `${resolveApiBaseUrl()}/v1/rtc/call`;

/** Where the call page lives: our own API (free direct video) or Daily's ready-made screen. */
export const callUrl = (video: VideoAccess) =>
  video.provider === 'p2p'
    ? // Fragment, not query: the token never reaches a server or its logs.
      `${resolveApiBaseUrl()}/v1/rtc/call#t=${encodeURIComponent(video.token)}`
    : `${video.roomId}?t=${encodeURIComponent(video.token)}`;
