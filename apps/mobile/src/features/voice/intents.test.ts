import { parseVoiceCommand } from './intents';

describe('parseVoiceCommand', () => {
  it('routes specialty words to a doctor search', () => {
    expect(parseVoiceCommand('my child has fever')).toMatchObject({
      kind: 'specialty',
      specialization: 'Pediatrics',
    });
    expect(parseVoiceCommand('skin problem')).toMatchObject({ specialization: 'Dermatology' });
    expect(parseVoiceCommand('kaan me dard')).toMatchObject({ specialization: 'ENT' });
  });

  it('navigates to screens by keyword (English + Hindi)', () => {
    expect(parseVoiceCommand('show my bookings')).toMatchObject({ path: '/patient/appointments' });
    expect(parseVoiceCommand('dawai chaiye')).toMatchObject({ path: '/patient/medicines' });
    expect(parseVoiceCommand('open profile')).toMatchObject({ path: '/patient/profile' });
    expect(parseVoiceCommand('ghar')).toMatchObject({ path: '/patient/home' });
  });

  it('handles generic doctor, back and help', () => {
    expect(parseVoiceCommand('find a doctor')).toMatchObject({ path: '/patient/doctors' });
    expect(parseVoiceCommand('go back')).toMatchObject({ kind: 'back' });
    expect(parseVoiceCommand('help')).toMatchObject({ kind: 'help' });
  });

  it('falls back to unknown', () => {
    expect(parseVoiceCommand('xyzzy order a pizza... ')).not.toMatchObject({ kind: 'unknown' }); // "order" -> medicines
    expect(parseVoiceCommand('blah blah nonsense')).toMatchObject({ kind: 'unknown' });
  });
});
