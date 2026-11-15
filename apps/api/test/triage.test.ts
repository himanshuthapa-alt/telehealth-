import { describe, expect, it } from 'vitest';
import { checkRedFlags } from '../src/modules/triage/red-flags';
import { createFakeTriageLlm, matchSymptoms, resolveRouting } from '../src/modules/triage/triage-llm';
import { createTriageService } from '../src/modules/triage/triage.service';
import { readsAsAdvice } from '../src/modules/triage/output-guard';
import { detectLanguage } from '../src/modules/language/detect';
import { nextEscalation } from '../src/modules/dispatch/escalation';

describe('red-flag emergency detection (deterministic, runs before any model)', () => {
  it('flags chest pain in Hindi and romanised', () => {
    expect(checkRedFlags('सीने में बहुत दर्द है').hit).toBe(true);
    expect(checkRedFlags('mujhe seene me dard ho raha hai').hit).toBe(true);
  });
  it('flags breathing trouble, bleeding, self-harm, snake bite', () => {
    expect(checkRedFlags('saans nahi aa rahi').ruleHits).toContain('breathing');
    expect(checkRedFlags('बहुत खून बह रहा है').hit).toBe(true);
    expect(checkRedFlags('मैं मरना चाहता हूँ').ruleHits).toContain('self_harm');
    expect(checkRedFlags('साँप ने काट लिया').hit).toBe(true);
  });
  it('does not flag ordinary symptoms', () => {
    expect(checkRedFlags('तीन दिन से बुखार और खांसी है').hit).toBe(false);
    expect(checkRedFlags('ghutne me dard hai').hit).toBe(false);
  });
});

describe('symptom -> specialty routing', () => {
  it('maps common symptoms to the right specialty', () => {
    expect(resolveRouting(matchSymptoms('तीन दिन से बुखार और खांसी है')).specialization).toBe(
      'General Physician',
    );
    expect(resolveRouting(matchSymptoms('हाथ पर खुजली और दाने')).specialization).toBe('Dermatology');
    expect(resolveRouting(matchSymptoms('ghutne me dard hai')).specialization).toBe('Orthopedics');
    expect(resolveRouting(matchSymptoms('period problem hai')).specialization).toBe('Gynecology');
    expect(resolveRouting(matchSymptoms('bahut ghabrahat aur neend nahi aati')).specialization).toBe(
      'Psychiatry',
    );
  });
  it('routes a child to Pediatrics even with another symptom', () => {
    const r = resolveRouting(matchSymptoms('mere bachche ko kaan me dard hai'));
    expect(r.specialization).toBe('Pediatrics');
  });
  it('marks palpitations as URGENT', () => {
    expect(resolveRouting(matchSymptoms('dil ki dhadkan tez hai')).urgency).toBe('URGENT');
  });
  it('defaults unknown symptoms to a General Physician', () => {
    expect(resolveRouting(matchSymptoms('kuch ajeeb sa lag raha hai')).specialization).toBe(
      'General Physician',
    );
  });
});

describe('triage service orchestration', () => {
  const service = createTriageService({
    llm: createFakeTriageLlm(),
    fallback: createFakeTriageLlm(),
    promptVersion: 'test',
  });

  it('red flags win over the model and never book', async () => {
    const d = await service.triage({ transcript: 'सीने में दर्द और साँस नहीं', language: 'hi' });
    expect(d.urgency).toBe('EMERGENCY');
    expect(d.specialization).toBeNull();
    expect(d.ruleHits.length).toBeGreaterThan(0);
  });

  it('routes a routine case and speaks a template reply (no diagnosis)', async () => {
    const d = await service.triage({ transcript: 'तीन दिन से बुखार और खांसी है', language: 'hi' });
    expect(d.urgency).toBe('ROUTINE');
    expect(d.specialization).toBe('General Physician');
    expect(readsAsAdvice(d.replyText)).toBe(false);
  });
});

describe('output guard blocks anything that reads as advice', () => {
  it('catches diagnoses, medicines and doses', () => {
    expect(readsAsAdvice('You probably have dengue')).toBe(true);
    expect(readsAsAdvice('take paracetamol 500mg twice a day')).toBe(true);
    expect(readsAsAdvice('आपको मलेरिया है')).toBe(true);
    expect(readsAsAdvice('ये डॉक्टर उपलब्ध हैं।')).toBe(false);
  });
});

describe('language detection', () => {
  it('detects Hindi, Hinglish and English', () => {
    expect(detectLanguage({ transcript: 'मुझे बुखार है', sttLanguage: 'hi' }).language).toBe('hi');
    expect(detectLanguage({ transcript: 'mujhe bukhar hai aur khansi', sttLanguage: 'hi' }).language).toBe(
      'hi-en',
    );
    expect(detectLanguage({ transcript: 'I have a fever since yesterday', sttLanguage: 'en' }).language).toBe(
      'en',
    );
  });
  it('lowers confidence on disagreement so the caller asks once', () => {
    expect(detectLanguage({ transcript: 'ok', sttLanguage: 'en' }).confidence).toBeLessThan(0.6);
  });
});

describe('urgent escalation ladder (pure)', () => {
  const cfg = { perDoctorTimeoutMs: 180_000, maxDoctors: 3, overallTimeoutMs: 600_000 };
  it('pages the first doctor, waits, then moves on after the timeout', () => {
    expect(
      nextEscalation(
        { attemptCount: 0, sinceLastPageMs: 0, totalElapsedMs: 0, candidatesLeft: 2, accepted: false },
        cfg,
      ),
    ).toBe('PAGE_NEXT');
    expect(
      nextEscalation(
        {
          attemptCount: 1,
          sinceLastPageMs: 10_000,
          totalElapsedMs: 10_000,
          candidatesLeft: 1,
          accepted: false,
        },
        cfg,
      ),
    ).toBe('WAIT');
    expect(
      nextEscalation(
        {
          attemptCount: 1,
          sinceLastPageMs: 200_000,
          totalElapsedMs: 200_000,
          candidatesLeft: 1,
          accepted: false,
        },
        cfg,
      ),
    ).toBe('PAGE_NEXT');
  });
  it('gives up after max doctors or overall timeout, and holds once accepted', () => {
    expect(
      nextEscalation(
        {
          attemptCount: 3,
          sinceLastPageMs: 200_000,
          totalElapsedMs: 500_000,
          candidatesLeft: 1,
          accepted: false,
        },
        cfg,
      ),
    ).toBe('GIVE_UP');
    expect(
      nextEscalation(
        {
          attemptCount: 1,
          sinceLastPageMs: 200_000,
          totalElapsedMs: 700_000,
          candidatesLeft: 5,
          accepted: false,
        },
        cfg,
      ),
    ).toBe('GIVE_UP');
    expect(
      nextEscalation(
        {
          attemptCount: 1,
          sinceLastPageMs: 999_999,
          totalElapsedMs: 999_999,
          candidatesLeft: 5,
          accepted: true,
        },
        cfg,
      ),
    ).toBe('WAIT');
  });
});
