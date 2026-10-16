import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { DoctorCard, DoctorDetail, DoctorSearchParams, Page } from '@telecare/shared';
import { api } from '@/lib/api';
import { PUBLIC_CACHE_KEY, PUBLIC_CACHE_MAX_AGE } from '@/lib/query';

// The doctor directory is public, so it is saved to disk and works offline (lib/query.ts).
const DOCTORS_KEY = PUBLIC_CACHE_KEY;

function toQueryString(params: DoctorSearchParams): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export function useDoctorSearch(params: Omit<DoctorSearchParams, 'page'>) {
  return useInfiniteQuery({
    queryKey: [DOCTORS_KEY, 'search', params],
    queryFn: ({ pageParam }) =>
      api.get<Page<DoctorCard>>(`/v1/doctors?${toQueryString({ ...params, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    staleTime: 5 * 60_000, // the directory changes rarely
    gcTime: PUBLIC_CACHE_MAX_AGE,
  });
}

/** A doctor's profile. Shows the card already in the search cache at once, then fills in the bio. */
export function useDoctor(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [DOCTORS_KEY, 'detail', id],
    queryFn: () => api.get<DoctorDetail>(`/v1/doctors/${encodeURIComponent(id)}`),
    staleTime: 5 * 60_000,
    gcTime: PUBLIC_CACHE_MAX_AGE,
    placeholderData: () => {
      for (const [, data] of queryClient.getQueriesData<InfiniteData<Page<DoctorCard>>>({
        queryKey: [DOCTORS_KEY, 'search'],
      })) {
        const card = data?.pages.flatMap((p) => p.items).find((d) => d.id === id);
        if (card) return { ...card, bio: '' };
      }
      return undefined;
    },
  });
}
