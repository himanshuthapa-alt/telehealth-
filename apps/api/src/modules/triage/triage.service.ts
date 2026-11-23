import {
  checkEmergencyKeywords,
  EMERGENCY_NUMBERS,
  TRIAGE_DISCLAIMER,
  type Specialization,
  type TriageRequest,
  type TriageResult,
  type TriageUrgency,
} from '@telecare/shared';
import { AppError } from '../../platform/http/errors';
import { createRequestBudget, type RequestBudget } from '../../platform/providers/request-budget';

export interface TriageRouterDeps {
  groqApiKey?: string;
  modelName?: string;
  whisperModel?: string;
  externalServicesMode?: 'test' | 'live';
  groqBudget?: RequestBudget;
}

export interface AudioTranscriptionInput {
  buffer: Uint8Array;
  mimeType: string;
  filename: string;
}

/**
 * Deterministic symptom classifier used for test mode, offline fallback,
 * and predictable fast responses.
 */
export function classifySymptomsRuleBased(symptoms: string): {
  urgency: TriageUrgency;
  specialization: Specialization;
  summary: string;
} {
  const lower = symptoms.toLowerCase();

  // Child / Pediatric triggers
  if (
    lower.includes('baby') ||
    lower.includes('child') ||
    lower.includes('baccha') ||
    lower.includes('bachha') ||
    lower.includes('infant') ||
    lower.includes('toddler') ||
    lower.includes('kid')
  ) {
    const isUrgent = lower.includes('high fever') || lower.includes('vomit') || lower.includes('tez bukhar');
    return {
      urgency: isUrgent ? 'URGENT' : 'ROUTINE',
      specialization: 'Pediatrics',
      summary: `Child health symptoms: ${symptoms.trim()}`,
    };
  }

  // Dermatology triggers
  if (
    lower.includes('rash') ||
    lower.includes('itch') ||
    lower.includes('skin') ||
    lower.includes('khujli') ||
    lower.includes('pimple') ||
    lower.includes('acne') ||
    lower.includes('daane') ||
    lower.includes('dermatitis') ||
    lower.includes('fungal')
  ) {
    return {
      urgency: 'ROUTINE',
      specialization: 'Dermatology',
      summary: `Dermatological / skin concern: ${symptoms.trim()}`,
    };
  }

  // ENT triggers
  if (
    lower.includes('ear') ||
    lower.includes('throat') ||
    lower.includes('nose') ||
    lower.includes('kaan') ||
    lower.includes('gala') ||
    lower.includes('tonsil') ||
    lower.includes('sinus') ||
    lower.includes('hearing')
  ) {
    return {
      urgency: 'ROUTINE',
      specialization: 'ENT',
      summary: `Ear, nose, or throat symptoms: ${symptoms.trim()}`,
    };
  }

  // Orthopedics triggers
  if (
    lower.includes('bone') ||
    lower.includes('joint') ||
    lower.includes('knee') ||
    lower.includes('haddi') ||
    lower.includes('back pain') ||
    lower.includes('kamar dard') ||
    lower.includes('fracture') ||
    lower.includes('sprain') ||
    lower.includes('arthritis') ||
    lower.includes('jod')
  ) {
    const isUrgent = lower.includes('unable to walk') || lower.includes('severe');
    return {
      urgency: isUrgent ? 'URGENT' : 'ROUTINE',
      specialization: 'Orthopedics',
      summary: `Musculoskeletal / bone & joint issue: ${symptoms.trim()}`,
    };
  }

  // Gynecology triggers
  if (
    lower.includes('pregnant') ||
    lower.includes('period') ||
    lower.includes('pregnancy') ||
    lower.includes('periods') ||
    lower.includes('menstrual') ||
    lower.includes('garbh') ||
    lower.includes('mahila')
  ) {
    const isUrgent = lower.includes('severe pain') || lower.includes('cramping');
    return {
      urgency: isUrgent ? 'URGENT' : 'ROUTINE',
      specialization: 'Gynecology',
      summary: `Women's health / gynecological concern: ${symptoms.trim()}`,
    };
  }

  // Psychiatry triggers
  if (
    lower.includes('depression') ||
    lower.includes('anxiety') ||
    lower.includes('panic') ||
    lower.includes('sadness') ||
    lower.includes('neend') ||
    lower.includes('insomnia') ||
    lower.includes('stress') ||
    lower.includes('tension') ||
    lower.includes('depressed')
  ) {
    return {
      urgency: 'ROUTINE',
      specialization: 'Psychiatry',
      summary: `Mental wellness / stress & mood concern: ${symptoms.trim()}`,
    };
  }

  // Cardiology triggers
  if (
    lower.includes('palpitation') ||
    lower.includes('high bp') ||
    lower.includes('blood pressure') ||
    lower.includes('dhadkan') ||
    lower.includes('ghabrahat') ||
    lower.includes('heart')
  ) {
    return {
      urgency: 'URGENT',
      specialization: 'Cardiology',
      summary: `Cardiovascular / heart health concern: ${symptoms.trim()}`,
    };
  }

  // Default General Physician
  const isUrgent =
    lower.includes('high fever') || lower.includes('tez bukhar') || lower.includes('severe vomiting');
  return {
    urgency: isUrgent ? 'URGENT' : 'ROUTINE',
    specialization: 'General Physician',
    summary: `General medical symptoms: ${symptoms.trim()}`,
  };
}

export function createTriageService(deps: TriageRouterDeps = {}) {
  const groqBudget = deps.groqBudget ?? createRequestBudget({ dailyLimit: 300, warningRatio: 0.8 });
  return {
    async transcribe(
      input: AudioTranscriptionInput,
    ): Promise<{ text: string; language: string | null; confidence: number }> {
      if (deps.externalServicesMode !== 'live') {
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Speech transcription is disabled in external-services test mode.',
        );
      }
      if (!deps.groqApiKey) {
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Speech transcription is not configured on this server.',
        );
      }
      if (!groqBudget.reserve()) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          'The daily speech-service request budget has been reached. Try again tomorrow.',
        );
      }

      const form = new FormData();
      const bytes = Uint8Array.from(input.buffer);
      form.append('file', new Blob([bytes], { type: input.mimeType }), input.filename);
      form.append('model', deps.whisperModel ?? 'whisper-large-v3-turbo');
      form.append('response_format', 'verbose_json');

      let response: Response;
      try {
        response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${deps.groqApiKey}` },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Speech transcription is temporarily unavailable.');
      }

      if (!response.ok) {
        throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Speech transcription is temporarily unavailable.');
      }

      const payload = (await response.json().catch(() => null)) as {
        text?: unknown;
        language?: unknown;
        segments?: Array<{ avg_logprob?: unknown; no_speech_prob?: unknown }>;
      } | null;
      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      if (!text)
        throw new AppError(422, 'VALIDATION_FAILED', 'No clear speech was detected. Please try again.');

      const segments = payload?.segments?.filter(
        (segment) => typeof segment.avg_logprob === 'number' && typeof segment.no_speech_prob === 'number',
      );
      const confidence = segments?.length
        ? segments.reduce(
            (sum, segment) =>
              sum + Math.exp(segment.avg_logprob as number) * (1 - (segment.no_speech_prob as number)),
            0,
          ) / segments.length
        : 0;

      return {
        text: text.slice(0, 1000),
        language: typeof payload?.language === 'string' ? payload.language : null,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
      };
    },

    async triage(request: TriageRequest): Promise<TriageResult> {
      const symptoms = request.symptoms.trim();

      // Step 1: Pre-AI Emergency Safety Check
      if (checkEmergencyKeywords(symptoms)) {
        return {
          urgency: 'EMERGENCY',
          recommendedSpecialization: 'General Physician',
          summary: `CRITICAL RED-FLAG SYMPTOM DETECTED: "${symptoms}". Immediate emergency medical intervention required.`,
          disclaimer: TRIAGE_DISCLAIMER,
          emergencyActions: EMERGENCY_NUMBERS,
          detectedLanguage: request.language ?? 'auto',
        };
      }

      // Step 2: Try LLM routing if Groq API key is present, else rule-based
      if (deps.groqApiKey && deps.externalServicesMode === 'live' && groqBudget.reserve()) {
        try {
          const model = deps.modelName ?? 'openai/gpt-oss-120b';
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${deps.groqApiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content:
                    'You are an AI Symptom Triage Router for TeleCare Plus in rural India. ' +
                    'You NEVER diagnose diseases or prescribe medicine. ' +
                    'Your job is strictly to classify symptoms into a recommended doctor specialty and urgency level.\n' +
                    'Allowed specializations: ["General Physician", "Pediatrics", "Gynecology", "Dermatology", "Orthopedics", "ENT", "Cardiology", "Psychiatry"].\n' +
                    'Allowed urgency levels: ["URGENT", "ROUTINE"].\n' +
                    'Also identify the language used: English, Hindi, Hinglish, Garhwali, or uncertain. ' +
                    'Use Garhwali only when its distinct vocabulary is clear, not just because speech is from India. ' +
                    'Return languageConfidence as a cautious number from 0 to 1; do not guess when uncertain. ' +
                    'Respond ONLY with valid JSON having the shape: {"specialization": string, "urgency": "URGENT"|"ROUTINE", "summary": string, "language": "English"|"Hindi"|"Hinglish"|"Garhwali"|"uncertain", "languageConfidence": number}',
                },
                {
                  role: 'user',
                  content: symptoms,
                },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1,
              max_completion_tokens: 256,
            }),
          });

          if (response.ok) {
            const data = (await response.json()) as {
              choices: Array<{ message: { content: string } }>;
            };
            const parsed = JSON.parse(data.choices[0]?.message?.content || '{}');
            const validSpecialization =
              typeof parsed.specialization === 'string' &&
              [
                'General Physician',
                'Pediatrics',
                'Gynecology',
                'Dermatology',
                'Orthopedics',
                'ENT',
                'Cardiology',
                'Psychiatry',
              ].includes(parsed.specialization);
            const validUrgency = parsed.urgency === 'URGENT' || parsed.urgency === 'ROUTINE';
            if (validSpecialization && validUrgency) {
              const language = ['English', 'Hindi', 'Hinglish', 'Garhwali', 'uncertain'].includes(
                parsed.language,
              )
                ? parsed.language.toLowerCase()
                : 'uncertain';
              const languageConfidence =
                typeof parsed.languageConfidence === 'number' && Number.isFinite(parsed.languageConfidence)
                  ? Math.max(0, Math.min(1, parsed.languageConfidence))
                  : 0;
              return {
                urgency: parsed.urgency,
                recommendedSpecialization: parsed.specialization,
                summary: parsed.summary || symptoms,
                disclaimer: TRIAGE_DISCLAIMER,
                detectedLanguage: language,
                languageConfidence,
              };
            }
          }
        } catch {
          // Graceful fallback to rule-based classifier on network/API failure
        }
      }

      // Step 3: Fallback / Test-mode Rule-based Classifier
      const classified = classifySymptomsRuleBased(symptoms);
      return {
        urgency: classified.urgency,
        recommendedSpecialization: classified.specialization,
        summary: classified.summary,
        disclaimer: TRIAGE_DISCLAIMER,
        detectedLanguage: request.language ?? 'auto',
      };
    },
  };
}

export type TriageService = ReturnType<typeof createTriageService>;
