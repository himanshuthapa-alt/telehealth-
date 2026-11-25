import type { Language, Specialization, TriageResult } from '@telecare/shared';
import { api } from '@/lib/api';

export type UrgentRequestStatus = 'PENDING' | 'ACCEPTED' | 'EXHAUSTED' | 'CANCELLED';

export interface UrgentRequest {
  id: string;
  symptoms: string;
  recommendedSpecialization: Specialization;
  language: Language | null;
  status: UrgentRequestStatus;
  assignedAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUrgentRequestResponse {
  triage: TriageResult;
  request: UrgentRequest | null;
  reason?: string;
}

export interface DoctorUrgentRequest {
  request: UrgentRequest;
  patientName: string;
}

export const activeUrgentRequestKey = (patientId: string) => `telecare.active-urgent-request.${patientId}`;

export const createUrgentRequest = (symptoms: string, language: Language | null, idempotencyKey: string) =>
  api.post<CreateUrgentRequestResponse>(
    '/v1/urgent-requests',
    { symptoms, language },
    { 'Idempotency-Key': idempotencyKey },
  );

export const getUrgentRequest = (id: string) =>
  api.get<UrgentRequest>(`/v1/urgent-requests/${encodeURIComponent(id)}`);

export const cancelUrgentRequest = (id: string) =>
  api.post<UrgentRequest>(`/v1/urgent-requests/${encodeURIComponent(id)}/cancel`);

export const getOnCallStatus = () => api.get<{ isOnCall: boolean }>('/v1/doctor/on-call');

export const setOnCallStatus = (isOnCall: boolean) =>
  api.put<{ isOnCall: boolean }>('/v1/doctor/on-call', { isOnCall });

export const getDoctorUrgentRequests = () => api.get<DoctorUrgentRequest[]>('/v1/doctor/urgent-requests');

export const respondToUrgentRequest = (id: string, response: 'accept' | 'decline') =>
  api.post<UrgentRequest>(`/v1/doctor/urgent-requests/${encodeURIComponent(id)}/${response}`);
