import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MedicineSummary, Prescription, SavePrescriptionRequest } from '@telecare/shared';
import { api } from '@/lib/api';

// Prescriptions are health data: in memory only, never saved to disk (lib/query.ts).
const keys = {
  all: ['prescriptions'] as const,
  one: (id: string) => ['prescriptions', 'one', id] as const,
  forConsultation: (consultationId: string) => ['prescriptions', 'consultation', consultationId] as const,
};

export const usePrescriptions = () =>
  useQuery({ queryKey: [...keys.all, 'mine'], queryFn: () => api.get<Prescription[]>('/v1/prescriptions') });

export const usePrescription = (id: string) =>
  useQuery({
    queryKey: keys.one(id),
    queryFn: () => api.get<Prescription>(`/v1/prescriptions/${encodeURIComponent(id)}`),
  });

export const useConsultationPrescriptions = (consultationId: string) =>
  useQuery({
    queryKey: keys.forConsultation(consultationId),
    queryFn: () =>
      api.get<Prescription[]>(`/v1/consultations/${encodeURIComponent(consultationId)}/prescriptions`),
  });

export const useMedicineSearch = (q: string) =>
  useQuery({
    queryKey: ['medicines', 'search', q],
    queryFn: () => api.get<MedicineSummary[]>(`/v1/medicines?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
  });

/** The doctor's actions on a prescription. Every success refreshes what the screens show. */
export function usePrescriptionActions(consultationId: string) {
  const queryClient = useQueryClient();
  const refresh = (p?: Prescription) => {
    if (p) queryClient.setQueryData(keys.one(p.id), p);
    void queryClient.invalidateQueries({ queryKey: keys.all });
  };
  return {
    openDraft: useMutation({
      mutationFn: () =>
        api.post<Prescription>(`/v1/consultations/${encodeURIComponent(consultationId)}/prescription`),
      onSuccess: refresh,
    }),
    save: useMutation({
      mutationFn: ({ id, body }: { id: string; body: SavePrescriptionRequest }) =>
        api.put<Prescription>(`/v1/prescriptions/${id}`, body),
      onSuccess: refresh,
    }),
    issue: useMutation({
      mutationFn: (id: string) => api.post<Prescription>(`/v1/prescriptions/${id}/issue`),
      onSuccess: refresh,
    }),
    voidIt: useMutation({
      mutationFn: ({ id, reason, revise }: { id: string; reason: string; revise: boolean }) =>
        api.post<{ voided: Prescription; draft: Prescription | null }>(`/v1/prescriptions/${id}/void`, {
          reason,
          revise,
        }),
      onSuccess: (r) => {
        refresh(r.voided);
        if (r.draft) refresh(r.draft);
      },
    }),
  };
}
