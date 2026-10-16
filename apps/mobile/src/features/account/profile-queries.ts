import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PatientProfile, UpdatePatientProfileRequest } from '@telecare/shared';
import { api, session } from '@/lib/api';

const profileKey = ['me', 'profile'] as const;

export function usePatientProfile() {
  return useQuery({ queryKey: profileKey, queryFn: () => api.get<PatientProfile>('/v1/me/profile') });
}

export function useUpdatePatientProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdatePatientProfileRequest) => api.patch<PatientProfile>('/v1/me/profile', patch),
    onSuccess: async (profile) => {
      queryClient.setQueryData(profileKey, profile);
      await session.updateUser({ fullName: profile.fullName });
    },
  });
}

/** True once the patient has filled in any optional detail. */
export const hasOptionalDetails = (p: PatientProfile) =>
  [p.dateOfBirth, p.gender, p.preferredLanguage, p.district].some((v) => v !== null);
