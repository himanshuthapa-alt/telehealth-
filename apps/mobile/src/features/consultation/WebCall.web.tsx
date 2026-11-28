import { createElement } from 'react';
import type { VideoAccess } from '@telecare/shared';
import { colors, radius } from '@/ui';

import { callUrl } from './call-url';

/** Web build: the call page (our direct call or Daily Prebuilt) in an iframe. */
export function WebCall({ video }: { video: VideoAccess; name: string; onFailed: () => void }) {
  return createElement('iframe', {
    title: 'Video call',
    src: callUrl(video),
    allow: 'camera; microphone; autoplay; display-capture; fullscreen',
    style: { width: '100%', height: 420, border: 0, borderRadius: radius.lg, background: colors.text },
  });
}
