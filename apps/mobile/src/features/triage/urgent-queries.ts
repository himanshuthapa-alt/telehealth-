import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelUrgentRequest,
  getDoctorUrgentRequests,
  getOnCallStatus,
  getUrgentRequest,
  respondToUrgentRequest,
  setOnCallStatus,
} from './urgent-api';

const keys = {
  all: ['urgent-requests'] as const,
  doctorInbox: ['urgent-requests', 'doctor-inbox'] as const,
  onCall: ['urgent-requests', 'on-call'] as const,
  patient: (id: string) => ['urgent-requests', 'patient', id] as const,
};

export function useUrgentRequest(id: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.patient(id ?? 'none'),
    queryFn: () => getUrgentRequest(id!),
    enabled: enabled && !!id,
    refetchInterval: 15_000,
  });
}

export function useCancelUrgentRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelUrgentRequest(id),
    onSuccess: (request) => {
      queryClient.setQueryData(keys.patient(id), request);
      void queryClient.invalidateQueries({ queryKey: keys.doctorInbox });
    },
  });
}

export function useDoctorUrgentRequests() {
  return useQuery({
    queryKey: keys.doctorInbox,
    queryFn: getDoctorUrgentRequests,
    refetchInterval: 15_000,
  });
}

export function useOnCallStatus() {
  return useQuery({ queryKey: keys.onCall, queryFn: getOnCallStatus });
}

export function useSetOnCallStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setOnCallStatus,
    onSuccess: (status) => {
      queryClient.setQueryData(keys.onCall, status);
      void queryClient.invalidateQueries({ queryKey: keys.doctorInbox });
    },
  });
}

export function useRespondToUrgentRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, response }: { id: string; response: 'accept' | 'decline' }) =>
      respondToUrgentRequest(id, response),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.doctorInbox }),
  });
}
