import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Appointment, AppointmentScope, BookAppointmentRequest, SlotsResponse } from '@telecare/shared';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-client';

// Appointments are personal health data: these keys are never saved to disk (see lib/query.ts).
const keys = {
  all: ['appointments'] as const,
  list: (scope: AppointmentScope) => ['appointments', 'list', scope] as const,
  detail: (id: string) => ['appointments', 'detail', id] as const,
  slots: (doctorId: string) => ['slots', doctorId] as const,
};

export function useSlots(doctorId: string) {
  return useQuery({
    queryKey: keys.slots(doctorId),
    queryFn: () => api.get<SlotsResponse>(`/v1/doctors/${encodeURIComponent(doctorId)}/slots?days=14`),
    staleTime: 30_000, // others may book; keep it fresh
  });
}

export function useAppointments(scope: AppointmentScope) {
  return useQuery({
    queryKey: keys.list(scope),
    queryFn: () => api.get<Appointment[]>(`/v1/appointments?scope=${scope}`),
  });
}

/** One appointment; shows the copy from any loaded list at once. */
export function useAppointment(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.detail(id),
    queryFn: () => api.get<Appointment>(`/v1/appointments/${encodeURIComponent(id)}`),
    placeholderData: () =>
      queryClient
        .getQueriesData<Appointment[]>({ queryKey: ['appointments', 'list'] })
        .flatMap(([, list]) => list ?? [])
        .find((a) => a.id === id),
  });
}

/**
 * Books a slot. The caller passes one idempotency key per booking attempt and
 * reuses it on retry, so a timeout followed by "Confirm" again can't book twice.
 */
export function useBookAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ request, idempotencyKey }: { request: BookAppointmentRequest; idempotencyKey: string }) =>
      api.post<Appointment>('/v1/appointments', request, { 'Idempotency-Key': idempotencyKey }),
    onSuccess: (appointment) => {
      queryClient.setQueryData(keys.detail(appointment.id), appointment);
      void queryClient.invalidateQueries({ queryKey: keys.all });
      void queryClient.invalidateQueries({ queryKey: keys.slots(appointment.doctor.id) });
    },
    onError: (err, { request }) => {
      // Someone else took it: refresh the times so the picker stops offering it.
      if (err instanceof ApiError && err.failure.kind === 'http' && err.failure.code === 'SLOT_TAKEN')
        void queryClient.invalidateQueries({ queryKey: keys.slots(request.doctorId) });
    },
  });
}

export function useCancelAppointment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string | null) =>
      api.post<Appointment>(`/v1/appointments/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {}),
    onSuccess: (appointment) => {
      queryClient.setQueryData(keys.detail(id), appointment);
      void queryClient.invalidateQueries({ queryKey: keys.all });
      void queryClient.invalidateQueries({ queryKey: keys.slots(appointment.doctor.id) });
    },
  });
}

/** True for an API failure with this error code. */
export const hasCode = (err: unknown, code: string) =>
  err instanceof ApiError && err.failure.kind === 'http' && err.failure.code === code;
