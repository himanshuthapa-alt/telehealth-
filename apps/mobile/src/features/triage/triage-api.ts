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
