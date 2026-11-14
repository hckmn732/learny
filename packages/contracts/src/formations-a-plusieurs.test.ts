import { describe, expect, it } from 'vitest';

import {
  GROUP_MAX_MEMBERS,
  GroupDto,
  GroupMemberView,
  GroupState,
  InvitationAccepted,
  InvitationCode,
  InvitationPreview,
  formationsAPlusieursRoutes,
} from './formations-a-plusieurs';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';

describe('[SPEC-724] contrats', () => {
  it('CA-1 — accepte un code LRN-XXXX et le normalise, refuse les caractères ambigus', () => {
    expect(InvitationCode.parse(' lrn-ab23 ')).toBe('LRN-AB23');
    expect(InvitationCode.safeParse('LRN-AB1O').success).toBe(false);
    expect(InvitationCode.safeParse('LRN-AB').success).toBe(false);
    expect(GROUP_MAX_MEMBERS).toBe(10);
  });

  it('CA-2 — la projection membre ne contient que les quatre faits publics et son identité', () => {
    const member = {
      userId: USER,
      firstName: 'Alice',
      role: 'owner',
      memberStatus: 'active',
      currentModulePosition: 1,
      validatedModules: 2,
      streakDays: 12,
    };
    expect(GroupMemberView.safeParse(member).success).toBe(true);
    expect(GroupMemberView.safeParse({ ...member, email: 'alice@test.learny.test' }).success).toBe(
      false,
    );
    expect(GroupMemberView.safeParse({ ...member, notes: 'privé' }).success).toBe(false);
    expect(GroupMemberView.safeParse({ ...member, streakDays: -1 }).success).toBe(false);
  });

  it('CA-1 — un groupe expose dix places au plus et un lien cohérent', () => {
    const value = {
      id: GROUP,
      formationId: FORMATION,
      formationTitle: 'Comptabilité générale',
      inviteCode: 'LRN-AB23',
      inviteLink: '/invitation/LRN-AB23',
      maxMembers: 10,
      memberCount: 1,
      ownerId: USER,
      viewerRole: 'owner',
      canManage: true,
      canLeave: false,
      members: [
        {
          userId: USER,
          firstName: 'Alice',
          role: 'owner',
          memberStatus: 'active',
          currentModulePosition: 1,
          validatedModules: 0,
          streakDays: 12,
        },
      ],
    };
    expect(GroupDto.safeParse(value).success).toBe(true);
    expect(GroupDto.safeParse({ ...value, memberCount: 11 }).success).toBe(false);
    expect(GroupDto.safeParse({ ...value, inviteLink: '/invitation/AAA' }).success).toBe(false);
  });

  it('CA-3 — l’invitation acceptée porte les prénoms et l’aperçu public reste minimal', () => {
    expect(
      InvitationAccepted.safeParse({
        formationId: FORMATION,
        formationTitle: 'SAP',
        memberFirstNames: ['Alice', 'Bob'],
      }).success,
    ).toBe(true);
    expect(
      InvitationPreview.safeParse({
        code: 'LRN-AB23',
        formationId: FORMATION,
        formationTitle: 'SAP',
        memberCount: 3,
        maxMembers: 10,
        full: false,
      }).success,
    ).toBe(true);
    expect(
      InvitationPreview.safeParse({
        code: 'LRN-AB23',
        formationId: FORMATION,
        formationTitle: 'SAP',
        memberCount: 3,
        maxMembers: 10,
        full: false,
        members: [{ email: 'x@y.fr' }],
      }).success,
    ).toBe(false);
  });

  it('CA-4 — l’état de groupe accepte l’absence de groupe pour le propriétaire', () => {
    expect(
      GroupState.safeParse({
        formationId: FORMATION,
        formationTitle: 'SAP',
        formationStatus: 'active',
        group: null,
        canCreate: true,
      }).success,
    ).toBe(true);
  });

  it('ET-3 — les sept routes documentées sont enregistrées', () => {
    expect(Object.keys(formationsAPlusieursRoutes).sort()).toEqual([
      'formationGroupCreate',
      'formationGroupGet',
      'groupLeave',
      'groupMemberRemove',
      'groupRotateCode',
      'invitationAccept',
      'invitationGet',
    ]);
    expect(formationsAPlusieursRoutes.invitationGet.auth).toBe('public');
    expect(formationsAPlusieursRoutes.formationGroupCreate.idempotent).toBe(true);
    expect(formationsAPlusieursRoutes.invitationAccept.idempotent).toBe(true);
  });
});
