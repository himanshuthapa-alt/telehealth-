import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';

export interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  /** Return true when the data is an empty list (or similar); `empty` is shown instead. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  /** Defaults to three skeleton cards. */
  loading?: ReactNode;
}

/**
 * The one wrapper every data screen uses for loading / empty / error / offline
 * (blueprint §18). Cached data always wins: if a refresh fails, the saved data
 * stays on screen and the offline banner explains why.
 */
export function QueryState<T>({ query, children, isEmpty, empty, loading }: QueryStateProps<T>) {
  if (query.data !== undefined) return isEmpty?.(query.data) ? empty : children(query.data);
  if (query.isPending && query.fetchStatus === 'paused') return <ErrorState kind="offline" />;
  if (query.isPending) return loading ?? <Skeleton />;
  return <ErrorState kind="error" error={query.error} onRetry={() => void query.refetch()} />;
}
