// First Sarvam call: Hindi text → speech (saved as WAV), then that audio → English text,
// the same round trip the app's voice feature makes.
// Run from apps/api:  node --env-file=.env scripts/sarvam-first-call.mjs
import { writeFile } from 'node:fs/promises';
import { SarvamAIClient } from 'sarvamai';

// The key comes from SARVAM_API_KEY in the environment; it is never printed.
const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });

const speech = await client.textToSpeech.convert({
  text: 'नमस्ते! मेरे बच्चे को बुखार है, मुझे डॉक्टर से बात करनी है।',
  language_code: 'hi-IN',
  model: 'bulbul:v3',
});
const wav = Buffer.from(speech.audios[0], 'base64');
await writeFile('sarvam-test.wav', wav);
console.log(`Text to speech: saved sarvam-test.wav (${wav.length} bytes)`);

const heard = await client.speechToText.transcribe({
  file: new File([wav], 'sarvam-test.wav', { type: 'audio/wav' }),
  model: 'saaras:v3',
  mode: 'translate',
});
console.log(`Speech to text (translated): "${heard.transcript}" [detected ${heard.language_code}]`);
