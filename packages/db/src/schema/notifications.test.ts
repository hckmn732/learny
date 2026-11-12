// Unit tests of the notification schema (SPEC-109 §12, CA-1). They are pure: no database
// connection. Enumerations, columns and constraints follow docs/architecture/data-model.md §8;
// the internal `href` rule and the bounds of title/body/dedupe key follow SPEC-109 ET-2 and the
// SPEC-209 contract.
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  ERROR_DELIVERY_STATUSES,
  NOTIFICATION_FILTERS,
  NOTIFICATION_TYPES,
  SCHEDULED_DELIVERY_STATUSES,
  deliveryChannel,
  deliveryErrorSchema,
  deliveryStateSchema,
  deliveryStatus,
  notificationBodySchema,
  notificationDedupeKeySchema,
  notificationDeliveries,
  notificationHrefSchema,
  notificationIconSchema,
  notificationInstantSchema,
  notificationTitleSchema,
  notificationType,
  notifications,
} from './notifications';

function columns(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();
}

function indexColumnNames(index: unknown): string[] {
  if (typeof index !== 'object' || index === null) return [];
  const config = (index as { config?: unknown }).config;
  if (typeof config !== 'object' || config === null) return [];
  const values = (config as { columns?: unknown }).columns;
  if (!Array.isArray(values)) return [];
  return values.map((column) => {
    if (typeof column === 'object' && column !== null && 'name' in column) {
      const name: unknown = (column as { name?: unknown }).name;
      return typeof name === 'string' ? name : '';
    }
    return '';
  });
}

const FIXED = new Date('2026-11-11T12:20:00Z');
const QUIET_END = new Date('2026-11-12T07:00:00Z');

describe('[SPEC-109] notification schema', () => {
  it('CA-1 — expose les trois énumérations de data-model §8', () => {
    expect(NOTIFICATION_TYPES).toEqual([
      'validation_soon',
      'course_ready',
      'global_quiz_today',
      'new_gap',
      'session_planned',
      'module_validated',
      'session_to_reschedule',
      'weekly_review',
      'milestone',
      'ai_cost_alert',
      'ai_task_failed',
      'export_ready',
      'group_invitation',
      'daily_digest',
      'relaunch',
      'planning_adjusted',
    ]);
    expect(DELIVERY_CHANNELS).toEqual(['email', 'push']);
    expect(DELIVERY_STATUSES).toEqual([
      'scheduled',
      'sent',
      'deferred_quiet',
      'capped',
      'failed',
      'skipped_pref',
    ]);
    expect(NOTIFICATION_FILTERS).toEqual(['all', 'unread']);
    expect(SCHEDULED_DELIVERY_STATUSES).toEqual(['scheduled', 'deferred_quiet']);
    expect(ERROR_DELIVERY_STATUSES).toEqual(['failed', 'skipped_pref']);
    // The exported tuples are the same as the Postgres enumerations.
    expect(NOTIFICATION_TYPES).toEqual(notificationType.enumValues);
    expect(DELIVERY_CHANNELS).toEqual(deliveryChannel.enumValues);
    expect(DELIVERY_STATUSES).toEqual(deliveryStatus.enumValues);
  });

  it('CA-1 — les deux tables portent les colonnes du modèle de données', () => {
    expect(columns(notifications)).toEqual(
      [
        'body',
        'created_at',
        'dedupe_key',
        'formation_id',
        'href',
        'icon',
        'id',
        'read_at',
        'title',
        'type',
        'user_id',
      ].sort(),
    );
    expect(columns(notificationDeliveries)).toEqual(
      ['channel', 'error', 'id', 'notification_id', 'scheduled_for', 'sent_at', 'status'].sort(),
    );
  });

  it('CA-1 / CA-2 — contraintes, unicité et index du modèle', () => {
    const inbox = getTableConfig(notifications);
    const inboxChecks = inbox.checks.map((constraint) => constraint.name);
    for (const name of [
      'notifications_href_check',
      'notifications_title_check',
      'notifications_body_check',
      'notifications_icon_check',
      'notifications_dedupe_key_check',
    ]) {
      expect(inboxChecks, name).toContain(name);
    }

    // EF-2, CL-1, CL-2 — one dedupe key per learner, null keys staying distinct.
    const dedupe = inbox.uniqueConstraints.find(
      (constraint) => constraint.name === 'notifications_user_id_dedupe_key_unique',
    );
    expect(dedupe).toBeDefined();
    expect(dedupe?.nullsNotDistinct).not.toBe(true);
    expect(dedupe?.columns.map((column) => column.name)).toEqual(['user_id', 'dedupe_key']);

    // EF-5 — newest first pagination and the partial unread badge.
    const createdIndex = inbox.indexes.find(
      (index) => index.config.name === 'notifications_user_id_created_at_idx',
    );
    expect(indexColumnNames(createdIndex)).toEqual(['user_id', 'created_at']);
    const unreadIndex = inbox.indexes.find(
      (index) => index.config.name === 'notifications_user_id_unread_idx',
    );
    expect(unreadIndex).toBeDefined();
    expect(unreadIndex?.config.where).toBeDefined();
    expect(indexColumnNames(unreadIndex)).toEqual(['user_id']);

    const journal = getTableConfig(notificationDeliveries);
    const journalChecks = journal.checks.map((constraint) => constraint.name);
    for (const name of [
      'notification_deliveries_sent_at_check',
      'notification_deliveries_scheduled_for_check',
      'notification_deliveries_error_check',
    ]) {
      expect(journalChecks, name).toContain(name);
    }
    // CL-1 — at most one delivery per notification and channel.
    const perChannel = journal.uniqueConstraints.find(
      (constraint) => constraint.name === 'notification_deliveries_notification_id_channel_unique',
    );
    expect(perChannel?.columns.map((column) => column.name)).toEqual([
      'notification_id',
      'channel',
    ]);
    const dueIndex = journal.indexes.find(
      (index) => index.config.name === 'notification_deliveries_status_scheduled_for_idx',
    );
    expect(indexColumnNames(dueIndex)).toEqual(['status', 'scheduled_for']);
  });

  it('ET-2 / CL-4 — un href doit être un chemin interne sûr', () => {
    for (const href of ['/', '/formations', '/notifications?filter=unread', '/a/b#c']) {
      expect(notificationHrefSchema.safeParse(href).success, href).toBe(true);
    }
    for (const href of [
      'https://example.com',
      '//evil.example',
      'javascript:alert(1)',
      '/\\evil.example',
      '/chemin avec espace',
      '/ligne\nsuivante',
      '',
    ]) {
      expect(notificationHrefSchema.safeParse(href).success, href).toBe(false);
    }
  });

  it('ET-2 — titre, texte, icône et clé de déduplication sont bornés', () => {
    expect(notificationTitleSchema.safeParse('Programme du jour').success).toBe(true);
    expect(notificationTitleSchema.safeParse('').success).toBe(false);
    expect(notificationTitleSchema.safeParse('   ').success).toBe(false);
    expect(notificationTitleSchema.safeParse('x'.repeat(120)).success).toBe(true);
    expect(notificationTitleSchema.safeParse('x'.repeat(121)).success).toBe(false);

    expect(notificationBodySchema.safeParse('Trois activités vous attendent.').success).toBe(true);
    expect(notificationBodySchema.safeParse('').success).toBe(false);
    expect(notificationBodySchema.safeParse('x'.repeat(400)).success).toBe(true);
    expect(notificationBodySchema.safeParse('x'.repeat(401)).success).toBe(false);

    expect(notificationIconSchema.safeParse('calendar-check').success).toBe(true);
    expect(notificationIconSchema.safeParse('<svg>').success).toBe(false);
    expect(notificationIconSchema.safeParse('Bell').success).toBe(false);

    expect(notificationDedupeKeySchema.safeParse('digest:2026-11-11').success).toBe(true);
    expect(notificationDedupeKeySchema.safeParse('').success).toBe(false);
    expect(notificationDedupeKeySchema.safeParse('x'.repeat(201)).success).toBe(false);
  });

  it('CL-5 — sent exige sent_at ; capped et skipped_pref ne le portent pas', () => {
    // A canonical UTC instant is expected.
    expect(notificationInstantSchema.safeParse('2026-11-11T12:20:00.000Z').success).toBe(true);
    expect(notificationInstantSchema.safeParse('2026-11-11T13:20:00+01:00').success).toBe(false);

    expect(
      deliveryStateSchema.safeParse({ status: 'sent', sentAt: FIXED }).success,
      'sent avec horodatage',
    ).toBe(true);
    expect(deliveryStateSchema.safeParse({ status: 'sent' }).success, 'sent sans horodatage').toBe(
      false,
    );
    expect(
      deliveryStateSchema.safeParse({ status: 'capped', sentAt: FIXED }).success,
      'capped avec horodatage',
    ).toBe(false);
    expect(
      deliveryStateSchema.safeParse({ status: 'skipped_pref', sentAt: FIXED }).success,
      'skipped_pref avec horodatage',
    ).toBe(false);
    expect(deliveryStateSchema.safeParse({ status: 'capped' }).success).toBe(true);
    expect(deliveryStateSchema.safeParse({ status: 'skipped_pref' }).success).toBe(true);

    // A scheduled or quiet-deferred delivery carries its next evaluation instant.
    expect(deliveryStateSchema.safeParse({ status: 'scheduled' }).success).toBe(false);
    expect(
      deliveryStateSchema.safeParse({ status: 'scheduled', scheduledFor: FIXED }).success,
    ).toBe(true);
    expect(
      deliveryStateSchema.safeParse({ status: 'deferred_quiet', scheduledFor: QUIET_END }).success,
    ).toBe(true);
    expect(deliveryStateSchema.safeParse({ status: 'failed' }).success).toBe(true);

    // ET-5 — an error is a safe code, only on failed/skipped_pref.
    expect(deliveryStateSchema.safeParse({ status: 'failed', error: 'smtp_timeout' }).success).toBe(
      true,
    );
    expect(
      deliveryStateSchema.safeParse({ status: 'skipped_pref', error: 'no_subscription' }).success,
    ).toBe(true);
    expect(deliveryStateSchema.safeParse({ status: 'failed', error: 'a@b.test' }).success).toBe(
      false,
    );
    expect(
      deliveryStateSchema.safeParse({ status: 'sent', sentAt: FIXED, error: 'late' }).success,
    ).toBe(false);
    expect(deliveryErrorSchema.safeParse('stale').success).toBe(true);
    expect(deliveryErrorSchema.safeParse('endpoint=https://push.test/abc').success).toBe(false);
  });
});
