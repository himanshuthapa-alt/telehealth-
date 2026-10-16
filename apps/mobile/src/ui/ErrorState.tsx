import { router } from 'expo-router';
import { errorMessage, isNotFound } from '@/lib/errors';
import { EmptyState } from './EmptyState';

export type ErrorStateProps = { kind: 'offline' } | { kind: 'error'; error: unknown; onRetry: () => void };

/** What to show when content couldn't load (blueprint §18). */
export function ErrorState(props: ErrorStateProps) {
  if (props.kind === 'offline')
    return (
      <EmptyState title="You're offline." body="This will load by itself when your connection is back." />
    );
  if (isNotFound(props.error))
    return (
      <EmptyState
        title="We couldn't find this."
        action={router.canGoBack() ? { label: 'Go back', onPress: () => router.back() } : undefined}
      />
    );
  return (
    <EmptyState title={errorMessage(props.error)} action={{ label: 'Try again', onPress: props.onRetry }} />
  );
}
