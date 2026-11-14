import { describe, expect, it } from 'vitest';

import { OnboardingUpdateBody, ProfileUpdateBody, StudyPreferencesUpdateBody } from './me';

describe('[SPEC-602] contrats du compte', () => {
  it('ProfileUpdateBody exige au moins un champ', () => {
    expect(ProfileUpdateBody.safeParse({}).success).toBe(false);
    expect(ProfileUpdateBody.safeParse({ firstName: 'Léa' }).success).toBe(true);
    expect(ProfileUpdateBody.safeParse({ tutorTone: 'tu', lastName: '' }).success).toBe(true);
  });

  it('StudyPreferencesUpdateBody refuse les jours et moments en double', () => {
    const base = { hoursPerDay: 2, studyDays: [1, 2], preferredSlots: ['matin'] };
    expect(StudyPreferencesUpdateBody.safeParse(base).success).toBe(true);
    const days = StudyPreferencesUpdateBody.safeParse({ ...base, studyDays: [1, 1] });
    expect(days.success).toBe(false);
    const slots = StudyPreferencesUpdateBody.safeParse({
      ...base,
      preferredSlots: ['soir', 'soir'],
    });
    expect(slots.success).toBe(false);
    if (!slots.success) expect(slots.error.issues[0]?.path).toEqual(['preferredSlots']);
  });

  it('OnboardingUpdateBody n’accepte les rappels qu’avec l’étape depart', () => {
    const reminders = { push: true, email: false, automations: true };
    expect(OnboardingUpdateBody.safeParse({ step: 'depart', reminders }).success).toBe(true);
    const wrong = OnboardingUpdateBody.safeParse({ step: 'rythme', reminders });
    expect(wrong.success).toBe(false);
    if (!wrong.success) expect(wrong.error.issues[0]?.path).toEqual(['reminders']);
    expect(OnboardingUpdateBody.safeParse({ step: 'ia', aiChoice: 'managed' }).success).toBe(true);
  });
});
