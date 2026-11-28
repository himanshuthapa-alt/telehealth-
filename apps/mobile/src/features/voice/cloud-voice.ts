/**
 * Indian-language voice via the API (Sarvam AI): record a short clip, upload
 * it, get back the English meaning + detected language + intent. Used when the
 * server says it has a key; otherwise the on-device recognizer (speech-input.ts)
 * handles English.
 */
import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import type { VoiceIntent } from '@telecare/shared';
import { api } from '@/lib/api';
import type { MicStatus } from '@/ui';

export interface Understood {
  transcript: string;
  languageCode: string | null;
  intent: VoiceIntent;
}

/** Display names for the languages Sarvam detects (shown as "Heard in Tamil"). */
export const LANGUAGE_NAMES: Record<string, string> = {
  'hi-IN': 'Hindi',
  'bn-IN': 'Bengali',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'gu-IN': 'Gujarati',
  'pa-IN': 'Punjabi',
  'od-IN': 'Odia',
  'en-IN': 'English',
  'ur-IN': 'Urdu',
  'as-IN': 'Assamese',
  'ne-IN': 'Nepali',
};

export function useVoiceCapabilities() {
  return useQuery({
    queryKey: ['voice-capabilities'],
    queryFn: () => api.get<{ indianLanguages: boolean }>('/v1/voice/capabilities'),
    staleTime: Infinity,
    retry: false,
  });
}

/** Record → stop → upload. `start` resolves false when the mic is not allowed. */
export function useCloudVoice() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  return {
    async start(): Promise<boolean> {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) return false;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    },
    async stopAndUnderstand(): Promise<Understood> {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (!recorder.uri) throw new Error('nothing recorded');
      const blob = await (await fetch(recorder.uri)).blob();
      return api.upload<Understood>('/v1/voice/understand', blob, blob.type || 'audio/mp4');
    },
  };
}

/**
 * One spoken turn for a conversation screen: tap the mic to record, tap again
 * (or wait 8 s) to stop. `onHeard` gets the meaning; `onProblem` gets a
 * sentence to show when the mic is blocked or the audio couldn't be understood.
 */
export function useVoiceTurn(
  onHeard: (u: Understood) => void | Promise<void>,
  onProblem: (message: string) => void,
) {
  const voice = useCloudVoice();
  const [mic, setMic] = useState<MicStatus>('idle');
  const autoStop = useRef<ReturnType<typeof setTimeout>>(undefined);

  const finish = useCallback(async () => {
    clearTimeout(autoStop.current);
    setMic('thinking');
    let heard: Understood;
    try {
      heard = await voice.stopAndUnderstand();
    } catch {
      setMic('idle');
      return onProblem("Sorry, I couldn't hear that clearly. Please try again.");
    }
    setMic('idle');
    await onHeard(heard);
  }, [voice, onHeard, onProblem]);

  const press = useCallback(async () => {
    if (mic === 'listening') return void finish();
    if (mic !== 'idle') return;
    if (!(await voice.start().catch(() => false)))
      return onProblem('Please allow the microphone to talk to me.');
    setMic('listening');
    // ponytail: fixed 8 s cap; add silence detection if people find tapping again awkward
    autoStop.current = setTimeout(() => void finish(), 8000);
  }, [mic, voice, finish, onProblem]);

  return { mic, setMic, press };
}
