import {
  SPEECH_TO_PROFILE_LANGUAGE,
  type DoctorCard,
  type Language,
  type SpeechLanguage,
  type Specialization,
} from '@telecare/shared';
import type { DoctorDirectory } from '../discovery/discovery.repository';
import type { MatchingRepository, OnCallDoctor } from './matching.repository';

export interface MatchResult {
  specialization: Specialization;
  language: Language | null;
  /** How we got here: exact | relaxed-language | relaxed-specialty | none. */
  relaxation: 'exact' | 'relaxed_language' | 'relaxed_specialty' | 'none';
  doctors: DoctorCard[];
}

export interface MatchingServiceDeps {
  directory: DoctorDirectory;
  repo: MatchingRepository;
}

function speechToLanguage(language: SpeechLanguage): Language {
  return SPEECH_TO_PROFILE_LANGUAGE[language] as Language;
}

/**
 * Tags are already resolved to a specialty by triage. Matching finds doctors,
 * relaxing language then specialty when nobody fits (project map §11 fallbacks).
 */
export function createMatchingService(deps: MatchingServiceDeps) {
  return {
    /** ROUTINE lane: find bookable doctors (own directory; partner pool is later). */
    async findRoutine(input: {
      specialization: Specialization;
      language: SpeechLanguage;
    }): Promise<MatchResult> {
      const lang = speechToLanguage(input.language);

      const exact = await deps.directory.search({
        specialization: input.specialization,
        language: lang,
        available: 'week',
        sort: 'rating',
      });
      if (exact.items.length > 0)
        return {
          specialization: input.specialization,
          language: lang,
          relaxation: 'exact',
          doctors: exact.items,
        };

      // Relax language to any (Hindi-speaking doctors cover most patients).
      const anyLang = await deps.directory.search({
        specialization: input.specialization,
        available: 'week',
        sort: 'rating',
      });
      if (anyLang.items.length > 0)
        return {
          specialization: input.specialization,
          language: null,
          relaxation: 'relaxed_language',
          doctors: anyLang.items,
        };

      // Relax specialty to General Physician.
      if (input.specialization !== 'General Physician') {
        const gp = await deps.directory.search({
          specialization: 'General Physician',
          available: 'week',
          sort: 'rating',
        });
        if (gp.items.length > 0)
          return {
            specialization: 'General Physician',
            language: null,
            relaxation: 'relaxed_specialty',
            doctors: gp.items,
          };
      }

      return { specialization: input.specialization, language: lang, relaxation: 'none', doctors: [] };
    },

    /** URGENT lane: on-call doctors, same relaxation ladder (project map §6.3). */
    async findOnCall(input: {
      specialization: Specialization;
      language: SpeechLanguage;
    }): Promise<{ specialization: Specialization; doctors: OnCallDoctor[] }> {
      const lang = speechToLanguage(input.language);
      let doctors = await deps.repo.onCall({ specialization: input.specialization, language: lang });
      if (doctors.length === 0) doctors = await deps.repo.onCall({ specialization: input.specialization });
      if (doctors.length === 0 && input.specialization !== 'General Physician')
        return {
          specialization: 'General Physician',
          doctors: await deps.repo.onCall({ specialization: 'General Physician' }),
        };
      return { specialization: input.specialization, doctors };
    },
  };
}

export type MatchingService = ReturnType<typeof createMatchingService>;
