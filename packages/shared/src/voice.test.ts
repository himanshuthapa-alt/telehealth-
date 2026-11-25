import { describe, expect, it } from 'vitest';
import { isVoiceIntent, parseVoiceIntent } from './voice';

describe('parseVoiceIntent', () => {
  it('lets emergency words win over everything', () => {
    expect(parseVoiceIntent('my child has chest pain')).toEqual({ kind: 'emergency' });
    expect(parseVoiceIntent('bachao saans nahi aa rahi')).toEqual({ kind: 'emergency' });
    // "fever" would be a specialty, but an emergency phrase still wins.
    expect(parseVoiceIntent('fever and not breathing')).toEqual({ kind: 'emergency' });
  });

  it('routes specialty words to a doctor search (English + Hindi)', () => {
    expect(parseVoiceIntent('my child has fever')).toMatchObject({
      kind: 'find_doctor',
      specialization: 'Pediatrics',
    });
    expect(parseVoiceIntent('skin problem')).toMatchObject({ specialization: 'Dermatology' });
    expect(parseVoiceIntent('kaan me dard')).toMatchObject({ specialization: 'ENT' });
    expect(parseVoiceIntent('find a doctor')).toEqual({ kind: 'find_doctor' });
  });

  it('navigates the patient journey by keyword', () => {
    expect(parseVoiceIntent('show my bookings')).toEqual({ kind: 'list_appointments' });
    expect(parseVoiceIntent('dawai chaiye')).toEqual({ kind: 'show_prescriptions' });
    expect(parseVoiceIntent('ghar')).toEqual({ kind: 'go_home' });
    expect(parseVoiceIntent('go back')).toEqual({ kind: 'go_back' });
    expect(parseVoiceIntent('help')).toEqual({ kind: 'help' });
  });

  it('falls back to unknown', () => {
    expect(parseVoiceIntent('')).toEqual({ kind: 'unknown' });
    expect(parseVoiceIntent('blah blah nonsense')).toEqual({ kind: 'unknown' });
  });

  it('isVoiceIntent accepts valid intents and rejects junk', () => {
    expect(isVoiceIntent({ kind: 'go_home' })).toBe(true);
    expect(isVoiceIntent({ kind: 'launch_rocket' })).toBe(false);
    expect(isVoiceIntent(null)).toBe(false);
    expect(isVoiceIntent('go_home')).toBe(false);
  });
});
