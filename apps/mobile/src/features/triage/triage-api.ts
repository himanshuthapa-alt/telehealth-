import { Platform } from 'react-native';
import {
  checkEmergencyKeywords,
  EMERGENCY_NUMBERS,
  TRIAGE_DISCLAIMER,
  type Specialization,
  type TriageRequest,
  type TriageResult,
  type TriageUrgency,
} from '@telecare/shared';
import { api } from '@/lib/api';
import { deleteRecording } from './delete-recording';

export interface TranscriptionResult {
  text: string;
  language: string | null;
  confidence: number;
}

/** Uploads a short clip to the TeleCare API; the local recording is deleted afterward. */
export async function transcribeAudio(uri: string): Promise<TranscriptionResult> {
  const form = new FormData();
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      if (!response.ok) throw new Error('The recording could not be read.');
      const blob = await response.blob();
      const extension = blob.type.includes('webm') ? 'webm' : 'm4a';
      form.append('audio', blob, `bolo.${extension}`);
    } else {
      form.append('audio', { uri, name: 'bolo.m4a', type: 'audio/mp4' } as unknown as Blob);
    }

    return await api.postForm<TranscriptionResult>('/v1/triage/transcribe', form, { timeoutMs: 45_000 });
  } finally {
    await deleteRecording(uri);
  }
}

/**
 * Offline rule-based fallback if network/server is unavailable.
 */
function localRuleBasedFallback(symptoms: string, language?: string): TriageResult {
  const lower = symptoms.toLowerCase();
  let specialization: Specialization = 'General Physician';
  let urgency: TriageUrgency = 'ROUTINE';

  if (lower.includes('baby') || lower.includes('child') || lower.includes('baccha')) {
    specialization = 'Pediatrics';
  } else if (lower.includes('rash') || lower.includes('skin') || lower.includes('khujli')) {
    specialization = 'Dermatology';
  } else if (
    lower.includes('ear') ||
    lower.includes('throat') ||
    lower.includes('kaan') ||
    lower.includes('gala')
  ) {
    specialization = 'ENT';
  } else if (
    lower.includes('bone') ||
    lower.includes('joint') ||
    lower.includes('knee') ||
    lower.includes('haddi')
  ) {
    specialization = 'Orthopedics';
  } else if (lower.includes('pregnant') || lower.includes('period')) {
    specialization = 'Gynecology';
  } else if (lower.includes('depress') || lower.includes('anxiety') || lower.includes('neend')) {
    specialization = 'Psychiatry';
  } else if (lower.includes('heart') || lower.includes('dhadkan') || lower.includes('bp')) {
    specialization = 'Cardiology';
    urgency = 'URGENT';
  }

  return {
    urgency,
    recommendedSpecialization: specialization,
    summary: `Reported symptoms: ${symptoms.trim()}`,
    disclaimer: TRIAGE_DISCLAIMER,
    detectedLanguage: language ?? 'auto',
  };
}

/**
 * Executes symptom triage. Always runs client-side emergency pre-check first
 * to guarantee that red-flag emergencies are handled instantly even with zero network.
 */
export async function triageSymptoms(request: TriageRequest): Promise<TriageResult> {
  const symptoms = request.symptoms.trim();

  // 1. Client-side Emergency Pre-check
  if (checkEmergencyKeywords(symptoms)) {
    return {
      urgency: 'EMERGENCY',
      recommendedSpecialization: 'General Physician',
      summary: `Critical emergency red-flag detected: "${symptoms}". Immediate emergency assistance required.`,
      disclaimer: TRIAGE_DISCLAIMER,
      emergencyActions: EMERGENCY_NUMBERS,
      detectedLanguage: request.language ?? 'auto',
    };
  }

  // 2. Call TeleCare server triage API
  try {
    return await api.post<TriageResult>('/v1/triage', {
      symptoms,
      language: request.language,
    });
  } catch {
    // 3. Fallback to local rule engine if offline or server is unreachable
    return localRuleBasedFallback(symptoms, request.language);
  }
}
