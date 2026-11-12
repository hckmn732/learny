// Unit tests of the identity schema (SPEC-102 §12: enumerations, defaults, declared columns).
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_DEFAULTS,
  AUTOMATION_KEYS,
  AUTOMATION_OPTIONS,
  NOTIFICATION_DEFAULTS,
  STUDY_DEFAULTS,
} from '@learny/config';

import {
  AUTOMATION_KEYS as AUTOMATION_ENUM_VALUES,
  ONBOARDING_STEPS,
  PAUSE_STATUSES,
  STUDY_SLOTS,
  TUTOR_TONES,
  automationSettings,
  notificationSettings,
  pauses,
  profiles,
  pushSubscriptions,
  studyPreferences,
} from './identity';

interface TableConfig {
  name: string;
  columns: PgColumn[];
  checks: { name: string }[];
  indexes: { config: { name: string; unique?: boolean } }[];
  foreignKeys: { onDelete?: string; reference: () => unknown }[];
}

function config(table: unknown): TableConfig {
  return getTableConfig(table as never) as unknown as TableConfig;
}

function column(table: unknown, name: string): PgColumn {
  const found = config(table).columns.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`colonne absente : ${name}`);
  return found;
}

describe('[SPEC-102] schéma identité', () => {
  it('declares the five domain enumerations (ET-1)', () => {
    expect(TUTOR_TONES).toEqual(['vous', 'tu']);
    expect(ONBOARDING_STEPS).toEqual(['profil', 'rythme', 'ia', 'rappels', 'depart', 'done']);
    expect(STUDY_SLOTS).toEqual(['matin', 'apres_midi', 'soir']);
    expect(AUTOMATION_ENUM_VALUES).toEqual([
      'reprise',
      'micro_seance',
      'echauffement',
      'remediation',
      'jeu_lacune',
      'questions_cartes',
      'plafond_quiz',
      'sprint',
      'bilan',
      'pause',
    ]);
    expect(PAUSE_STATUSES).toEqual(['active', 'ended', 'cancelled']);
    expect(AUTOMATION_KEYS).toEqual(AUTOMATION_ENUM_VALUES);
  });

  it('mirrors the ten automation defaults with admitted values (EF-6, CA-6)', () => {
    expect(Object.keys(AUTOMATION_DEFAULTS).sort()).toEqual([...AUTOMATION_KEYS].sort());
    for (const key of AUTOMATION_KEYS) {
      const defaults = AUTOMATION_DEFAULTS[key] as Record<string, unknown>;
      const options = AUTOMATION_OPTIONS[key] as Record<string, readonly unknown[]>;
      expect(Object.keys(defaults).sort(), key).toEqual(Object.keys(options).sort());
      for (const [name, value] of Object.entries(defaults)) {
        expect(options[name], `${key}.${name}`).toContain(value);
      }
    }
  });

  it('declares the study and notification defaults (BR-ACC-08, BR-NOT-04)', () => {
    expect(STUDY_DEFAULTS).toEqual({
      hoursPerDay: 2,
      studyDays: [1, 2, 3, 4, 5],
      preferredSlots: ['soir'],
    });
    expect(NOTIFICATION_DEFAULTS.channelEmail).toBe(true);
    expect(NOTIFICATION_DEFAULTS.channelPush).toBe(true);
    expect(Object.values(NOTIFICATION_DEFAULTS.types)).toEqual(Array(6).fill(true));
    expect(NOTIFICATION_DEFAULTS.digestTime).toBe('08:00');
    expect(NOTIFICATION_DEFAULTS.quietStart).toBe('21:00');
    expect(NOTIFICATION_DEFAULTS.quietEnd).toBe('08:00');
    expect(NOTIFICATION_DEFAULTS.weekendQuiet).toBe(true);
    expect(NOTIFICATION_DEFAULTS.maxPerDay).toBe(5);
  });

  it('declares the profiles columns and their defaults (ET-2, BR-ACC-12)', () => {
    const table = config(profiles);
    expect(table.name).toBe('profiles');
    expect(table.columns.map((candidate) => candidate.name)).toEqual([
      'id',
      'email',
      'first_name',
      'last_name',
      'course_language',
      'tutor_tone',
      'timezone',
      'onboarding_step',
      'onboarding_completed_at',
      'terms_version',
      'terms_accepted_at',
      'current_formation_id',
      'deletion_requested_at',
      'deletion_scheduled_for',
      'sidebar_collapsed',
      'streak_days',
      'streak_computed_on',
      'created_at',
      'updated_at',
    ]);

    expect(column(profiles, 'email').notNull).toBe(true);
    expect(column(profiles, 'course_language').default).toBe('fr');
    expect(column(profiles, 'tutor_tone').default).toBe('vous');
    expect(column(profiles, 'timezone').default).toBe('Europe/Paris');
    expect(column(profiles, 'onboarding_step').default).toBe('profil');
    expect(column(profiles, 'sidebar_collapsed').default).toBe(false);
    expect(column(profiles, 'streak_days').default).toBe(0);
    expect(column(profiles, 'deletion_scheduled_for').notNull).toBe(false);

    const checks = table.checks.map((check) => check.name);
    expect(checks).toEqual(
      expect.arrayContaining([
        'profiles_first_name_length_check',
        'profiles_last_name_length_check',
        'profiles_streak_days_check',
        'profiles_deletion_pair_check',
      ]),
    );
    expect(table.indexes.map((index) => index.config.name)).toContain(
      'profiles_deletion_scheduled_for_idx',
    );
  });

  it('declares the study preferences bounds (BR-ACC-08, CL-3)', () => {
    expect(column(studyPreferences, 'hours_per_day').default).toBe(2);
    expect(column(studyPreferences, 'hours_per_day').notNull).toBe(true);
    expect(column(studyPreferences, 'study_days').notNull).toBe(true);
    expect(column(studyPreferences, 'preferred_slots').notNull).toBe(true);
    const checkNames = config(studyPreferences).checks.map((check) => check.name);
    expect(checkNames).toEqual(
      expect.arrayContaining([
        'study_preferences_hours_per_day_check',
        'study_preferences_study_days_check',
        'study_preferences_preferred_slots_check',
      ]),
    );
  });

  it('declares the notification settings defaults (BR-NOT-04, BR-NOT-05, CL-4)', () => {
    expect(column(notificationSettings, 'channel_email').default).toBe(true);
    expect(column(notificationSettings, 'channel_push').default).toBe(true);
    for (const name of [
      'type_revision',
      'type_validation',
      'type_course',
      'type_gap',
      'type_planning',
      'type_relaunch',
    ]) {
      expect(column(notificationSettings, name).default, name).toBe(true);
    }
    expect(column(notificationSettings, 'digest_time').default).toBe('08:00');
    expect(column(notificationSettings, 'quiet_start').default).toBe('21:00');
    expect(column(notificationSettings, 'quiet_end').default).toBe('08:00');
    expect(column(notificationSettings, 'weekend_quiet').default).toBe(true);
    expect(column(notificationSettings, 'max_per_day').default).toBe(5);
    expect(config(notificationSettings).checks.map((check) => check.name)).toContain(
      'notification_settings_max_per_day_check',
    );
  });

  it('declares push subscriptions and their unique endpoint (CL-8)', () => {
    expect(column(pushSubscriptions, 'endpoint').notNull).toBe(true);
    expect(column(pushSubscriptions, 'endpoint').isUnique).toBe(true);
    expect(column(pushSubscriptions, 'p256dh').notNull).toBe(true);
    expect(column(pushSubscriptions, 'auth').notNull).toBe(true);
    expect(column(pushSubscriptions, 'failure_count').default).toBe(0);
    expect(config(pushSubscriptions).indexes.map((index) => index.config.name)).toContain(
      'push_subscriptions_user_id_idx',
    );
  });

  it('declares the automation settings composite key (ET-2)', () => {
    const table = getTableConfig(automationSettings);
    expect(table.primaryKeys.map((key) => key.columns.map((c) => c.name))).toEqual([
      ['user_id', 'key'],
    ]);
    expect(column(automationSettings, 'enabled').default).toBe(true);
    expect(column(automationSettings, 'params').notNull).toBe(true);
  });

  it('declares the pause coherence constraints (CL-5, CL-6)', () => {
    const table = config(pauses);
    expect(table.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(['pauses_period_check', 'pauses_ended_at_check']),
    );
    const activeIndex = table.indexes.find(
      (index) => index.config.name === 'pauses_one_active_per_user',
    );
    expect(activeIndex?.config.unique).toBe(true);
    expect(column(pauses, 'diagnostic_on_return').default).toBe(true);
    expect(column(pauses, 'status').default).toBe('active');
  });
});
