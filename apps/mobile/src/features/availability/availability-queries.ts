import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Availability, AvailabilityRule } from '@telecare/shared';
import { api } from '@/lib/api';

const KEY = ['availability'] as const;

export function useAvailability() {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<Availability>('/v1/availability') });
}

export function useAvailabilityMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: KEY });
    void queryClient.invalidateQueries({ queryKey: ['slots'] });
  };
  return {
    saveRules: useMutation({
      mutationFn: (rules: AvailabilityRule[]) => api.put<Availability>('/v1/availability/rules', { rules }),
      onSuccess: (availability) => {
        queryClient.setQueryData(KEY, availability);
        void queryClient.invalidateQueries({ queryKey: ['slots'] });
      },
    }),
    block: useMutation({
      mutationFn: (date: string) =>
        api.put<{ bookedThatDay: number }>(`/v1/availability/exceptions/${date}`, {}),
      onSuccess: refresh,
    }),
    unblock: useMutation({
      mutationFn: (date: string) => api.delete(`/v1/availability/exceptions/${date}`),
      onSuccess: refresh,
    }),
  };
}
