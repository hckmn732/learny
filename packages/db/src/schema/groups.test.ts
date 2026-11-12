// Unit tests of the shared-formation schema (SPEC-111 §12, CA-1, CA-4). Pure: no database.
// Enumerations, columns, constraints and the invitation-code generator follow
// docs/architecture/data-model.md §10, ADR-0035 and ET-1/ET-2.
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  INVITE_CODE_ALPHABET,
  cryptoRandomIndex,
  generateInviteCode,
  isInviteCode,
  parseInviteCode,
} from '../repositories/invite-code';

import { formationStatus } from './formations';
import {
  GROUP_INVITE_CODE_PATTERN,
  GROUP_MEMBER_PROGRESS_COLUMNS,
  GROUP_MEMBER_STATUSES,
  GROUP_ROLES,
  groupMembers,
  groupRole,
  groups,
} from './groups';

function columns(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();
}

function constraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  const config = getTableConfig(table);
  return [
    ...config.primaryKeys.map((constraint) => constraint.getName()),
    ...config.uniqueConstraints.map((constraint) => constraint.getName()),
    ...config.checks.map((constraint) => constraint.name),
  ].filter((name): name is string => typeof name === 'string');
}

function foreignKeys(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys.map((foreignKey) => ({
    columns: foreignKey.reference().columns.map((column) => column.name),
    foreignColumns: foreignKey.reference().foreignColumns.map((column) => column.name),
    table: getTableName(foreignKey.reference().foreignTable),
    onDelete: foreignKey.onDelete,
  }));
}

describe('[SPEC-111] group schema', () => {
  it('CA-1 — expose les énumérations et les statuts admis', () => {
    expect(GROUP_ROLES).toEqual(['owner', 'member']);
    expect(GROUP_ROLES).toEqual(groupRole.enumValues);
    expect(GROUP_MEMBER_STATUSES).toEqual(['active', 'paused', 'completed']);
    // EF-2 — the three membership statuses are a strict subset of the formation lifecycle; the
    // database CHECK refuses the three other formation statuses.
    expect(formationStatus.enumValues).toEqual([
      'cadrage',
      'programme_proposed',
      'active',
      'paused',
      'completed',
      'archived',
    ]);
    for (const status of GROUP_MEMBER_STATUSES) {
      expect(formationStatus.enumValues).toContain(status);
    }
    expect(groupRole.enumValues).toHaveLength(2);
    expect(groupMembers.memberStatus.enumValues).toEqual(formationStatus.enumValues);
    expect(groupMembers.role.enumValues).toEqual(GROUP_ROLES);
  });

  it('CA-1 — les deux tables portent les colonnes de data-model §10', () => {
    expect(getTableName(groups)).toBe('groups');
    expect(columns(groups)).toEqual([
      'code_rotated_at',
      'created_at',
      'formation_id',
      'id',
      'invite_code',
      'max_members',
      'owner_id',
    ]);
    expect(getTableName(groupMembers)).toBe('group_members');
    expect(columns(groupMembers)).toEqual([
      'group_id',
      'joined_at',
      'left_at',
      'member_status',
      'role',
      'user_id',
    ]);

    // EF-4 — the limited view projects exactly six columns.
    expect(GROUP_MEMBER_PROGRESS_COLUMNS).toEqual([
      'group_id',
      'user_id',
      'first_name',
      'current_module_position',
      'validated_modules',
      'streak_days',
    ]);
  });

  it('CA-1 — les contraintes imposent unicité, capacité et forme du code', () => {
    const groupConstraints = constraintNames(groups);
    for (const expected of [
      'groups_formation_id_unique',
      'groups_invite_code_unique',
      'groups_invite_code_format_check',
      'groups_max_members_check',
      'groups_code_rotated_at_check',
    ]) {
      expect(groupConstraints, expected).toContain(expected);
    }
    const memberConstraints = constraintNames(groupMembers);
    for (const expected of [
      'group_members_pkey',
      'group_members_member_status_check',
      'group_members_left_at_check',
    ]) {
      expect(memberConstraints, expected).toContain(expected);
    }

    // ET-1 — the default maximum is ten and the bounds live in a CHECK, not only in the API.
    expect(groups.maxMembers.default).toBe(10);
    expect(groups.maxMembers.columnType).toBe('PgSmallInt');
    const capacityCheck = getTableConfig(groups).checks.find(
      (constraint) => constraint.name === 'groups_max_members_check',
    );
    expect(capacityCheck).toBeDefined();

    // EF-1 — the code is unique and its database-side pattern is the canonical one.
    expect(String(GROUP_INVITE_CODE_PATTERN)).toBe(String(/^LRN-[A-Z2-9]{4}$/));
    const formatCheck = getTableConfig(groups).checks.find(
      (constraint) => constraint.name === 'groups_invite_code_format_check',
    );
    expect(formatCheck).toBeDefined();
  });

  it('CA-1, CA-4 — les clés étrangères suivent la cascade attendue', () => {
    expect(foreignKeys(groups)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['formation_id'],
          foreignColumns: ['id'],
          table: 'formations',
          onDelete: 'cascade',
        }),
        expect.objectContaining({
          columns: ['owner_id'],
          foreignColumns: ['id'],
          table: 'profiles',
          onDelete: 'cascade',
        }),
      ]),
    );
    expect(foreignKeys(groupMembers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['group_id'],
          foreignColumns: ['id'],
          table: 'groups',
          onDelete: 'cascade',
        }),
        expect.objectContaining({
          columns: ['user_id'],
          foreignColumns: ['id'],
          table: 'profiles',
          onDelete: 'cascade',
        }),
      ]),
    );
  });

  it('CA-1 — le motif de code accepte uniquement LRN-XXXX sur l’alphabet A-Z2-9', () => {
    for (const valid of ['LRN-AB23', 'LRN-2345', 'LRN-ZZZZ']) {
      expect(isInviteCode(valid), valid).toBe(true);
      expect(parseInviteCode(` ${valid.toLowerCase()} `)).toBe(valid);
    }
    for (const invalid of [
      'LRN-AB2',
      'LRN-AB234',
      'LRN-AB0O',
      'LRN-AB1O',
      'LRN-ab23',
      'lrn-AB23',
      'CODE-AB23',
      '',
      42,
      null,
    ]) {
      expect(isInviteCode(invalid), String(invalid)).toBe(false);
    }
    expect(() => parseInviteCode('LRN-AB1O')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });

  it('CA-1, CL-2 — l’alphabet du tirage est exact et la génération est injectable', () => {
    expect(INVITE_CODE_ALPHABET).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789');
    expect(INVITE_CODE_ALPHABET).toHaveLength(34);
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(34);
    expect(INVITE_CODE_ALPHABET).not.toContain('0');
    expect(INVITE_CODE_ALPHABET).not.toContain('1');

    const sequence = [0, 1, 26, 27];
    const drawFromSequence = () => {
      let cursor = 0;
      return () => sequence[cursor++] ?? 0;
    };
    expect(generateInviteCode(drawFromSequence())).toBe('LRN-AB23');
    expect(generateInviteCode(drawFromSequence())).toBe('LRN-AB23');

    // The cryptographic source always stays inside the alphabet.
    for (let draw = 0; draw < 50; draw += 1) {
      const index = cryptoRandomIndex(INVITE_CODE_ALPHABET.length);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(INVITE_CODE_ALPHABET.length);
    }

    expect(() => generateInviteCode(() => INVITE_CODE_ALPHABET.length)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
    expect(() => generateInviteCode(() => -1)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });
});
