import { parseVoiceIntent, sayForIntent } from './intents';

describe('voice controller', () => {
  it('speaks a warning (and does not just navigate) for emergencies', () => {
    const intent = parseVoiceIntent('he is not breathing');
    expect(intent.kind).toBe('emergency');
    expect(sayForIntent(intent)).toMatch(/call 108/i);
  });

  it('names the specialty in the spoken confirmation', () => {
    expect(sayForIntent(parseVoiceIntent('skin problem'))).toBe('Finding a Dermatology doctor');
    expect(sayForIntent(parseVoiceIntent('find a doctor'))).toBe('Opening doctors');
  });

  it('confirms screen navigation', () => {
    expect(sayForIntent(parseVoiceIntent('show my bookings'))).toBe('Opening your bookings');
    expect(sayForIntent(parseVoiceIntent('dawai'))).toBe('Opening medicines');
  });

  it('offers help for an unknown phrase', () => {
    expect(sayForIntent(parseVoiceIntent('blah blah'))).toMatch(/say help/i);
  });
});
