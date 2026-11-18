import { describe, expect, it } from 'vitest';
import { checkEmergencyKeywords, TRIAGE_DISCLAIMER, type TriageResult } from '@telecare/shared';
import { createTriageService } from '../src/modules/triage/triage.service';
import { listen, testApp } from './helpers';

/** HTTP integration tests require a real database. Skip gracefully in unit-only environments. */
const hasTestDb = !!process.env.TEST_DATABASE_URL;

describe('Emergency keyword pre-check', () => {
  it('detects emergency symptoms in English', () => {
    expect(checkEmergencyKeywords('I have sudden severe chest pain')).toBe(true);
    expect(checkEmergencyKeywords('Patient is unconscious after a fall')).toBe(true);
    expect(checkEmergencyKeywords('Difficulty breathing and cannot breathe')).toBe(true);
    expect(checkEmergencyKeywords('Heavy bleeding from leg')).toBe(true);
  });

  it('detects emergency symptoms in Hindi / Hinglish', () => {
    expect(checkEmergencyKeywords('mere seene me dard ho raha hai')).toBe(true);
    expect(checkEmergencyKeywords('mareez behosh ho gaya')).toBe(true);
    expect(checkEmergencyKeywords('saans nahi aa rahi')).toBe(true);
  });

  it('detects emergency symptoms in Garhwali', () => {
    expect(checkEmergencyKeywords('chhati peeda bhot tezi se')).toBe(true);
    expect(checkEmergencyKeywords('saans ni aarun')).toBe(true);
  });

  it('returns false for routine symptoms', () => {
    expect(checkEmergencyKeywords('fever and cough for 2 days')).toBe(false);
    expect(checkEmergencyKeywords('skin rash on my arm')).toBe(false);
    expect(checkEmergencyKeywords('mild headache and fatigue')).toBe(false);
  });
});

describe('TriageService symptom routing', () => {
  const service = createTriageService();

  it('routes emergency red-flags to EMERGENCY urgency and emergency numbers', async () => {
    const res = await service.triage({ symptoms: 'Severe chest pain and sweating' });
    expect(res.urgency).toBe('EMERGENCY');
    expect(res.emergencyActions).toBeDefined();
    expect(res.emergencyActions?.some((a) => a.dial === '112')).toBe(true);
    expect(res.emergencyActions?.some((a) => a.dial === '108')).toBe(true);
    expect(res.disclaimer).toBe(TRIAGE_DISCLAIMER);
  });

  it('routes child symptoms to Pediatrics', async () => {
    const res = await service.triage({ symptoms: 'My 2 year old child has a fever' });
    expect(res.urgency).toBe('ROUTINE');
    expect(res.recommendedSpecialization).toBe('Pediatrics');
    expect(res.disclaimer).toBe(TRIAGE_DISCLAIMER);
  });

  it('routes skin rashes to Dermatology', async () => {
    const res = await service.triage({ symptoms: 'Itchy red rash on cheeks and neck' });
    expect(res.urgency).toBe('ROUTINE');
    expect(res.recommendedSpecialization).toBe('Dermatology');
    expect(res.disclaimer).toBe(TRIAGE_DISCLAIMER);
  });

  it('routes ear/throat complaints to ENT', async () => {
    const res = await service.triage({ symptoms: 'Severe ear pain and sore throat' });
    expect(res.urgency).toBe('ROUTINE');
    expect(res.recommendedSpecialization).toBe('ENT');
  });

  it('routes bone and joint pain to Orthopedics', async () => {
    const res = await service.triage({ symptoms: 'Knee joint pain when walking' });
    expect(res.urgency).toBe('ROUTINE');
    expect(res.recommendedSpecialization).toBe('Orthopedics');
  });

  it('routes anxiety and depression to Psychiatry', async () => {
    const res = await service.triage({ symptoms: 'Feeling extreme anxiety and panic attacks' });
    expect(res.urgency).toBe('ROUTINE');
    expect(res.recommendedSpecialization).toBe('Psychiatry');
  });

  it('routes general fever and body ache to General Physician', async () => {
    const res = await service.triage({ symptoms: 'Fever and cold for past two days' });
    expect(res.urgency).toBe('ROUTINE');
    expect(res.recommendedSpecialization).toBe('General Physician');
  });
});

describe('POST /v1/triage endpoint', () => {
  it.skipIf(!hasTestDb)('allows public triage classification without auth header', async () => {
    const server = await listen(testApp().app);
    try {
      const res = await fetch(`${server.url}/v1/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: 'Red skin rash with itching' }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as TriageResult;
      expect(data.recommendedSpecialization).toBe('Dermatology');
      expect(data.urgency).toBe('ROUTINE');
      expect(data.disclaimer).toBe(TRIAGE_DISCLAIMER);
    } finally {
      await server.close();
    }
  });

  it.skipIf(!hasTestDb)('rejects empty symptoms with 400 validation error', async () => {
    const server = await listen(testApp().app);
    try {
      const res = await fetch(`${server.url}/v1/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: '' }),
      });
      expect(res.status).toBe(400);
    } finally {
      await server.close();
    }
  });
});
