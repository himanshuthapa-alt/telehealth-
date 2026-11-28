import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DoctorForReview,
  DoctorStats,
  DoctorVerificationRequest,
  DoctorVerificationStatus,
  MyDoctorProfile,
  UpdateDoctorProfileRequest,
} from '@telecare/shared';
import { api } from '@/lib/api';

// Private data: none of these keys are persisted to disk (see lib/query.ts).
const keys = {
  profile: ['doctor', 'me', 'profile'] as const,
  stats: ['doctor', 'me', 'stats'] as const,
  review: (status: DoctorVerificationStatus) => ['admin', 'doctors', status] as const,
};

export function useMyDoctorProfile() {
  return useQuery({
    queryKey: keys.profile,
    queryFn: () => api.get<MyDoctorProfile>('/v1/me/doctor-profile'),
  });
}

export function useUpdateDoctorProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateDoctorProfileRequest) =>
      api.patch<MyDoctorProfile>('/v1/me/doctor-profile', patch),
    onSuccess: (profile) => {
      queryClient.setQueryData(keys.profile, profile);
      void queryClient.invalidateQueries({ queryKey: keys.stats }); // earnings use the fee
    },
  });
}

export function useDoctorStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api.get<DoctorStats>('/v1/me/doctor-stats') });
}

export function useDoctorsForReview(status: DoctorVerificationStatus) {
  return useQuery({
    queryKey: keys.review(status),
    queryFn: () => api.get<DoctorForReview[]>(`/v1/admin/doctors?status=${status}`),
  });
}

export function useDecideDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DoctorVerificationRequest & { id: string }) =>
      api.post<void>(`/v1/admin/doctors/${encodeURIComponent(id)}/verification`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'doctors'] }),
  });
}
