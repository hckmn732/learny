// Unit tests of the shared-formation service (SPEC-724 §12, CA-1 to CA-4; BR-GRP-01 to BR-GRP-05,
// BR-APP-03). The transaction and the repositories are fakes: these tests pin the strict public
// projection, the code and capacity, the leave copy, the three-active limit, the idempotent
// acceptance and the neutral 404. The real SQL and RLS stay pinned by the integration suite.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import type { Group, GroupMember } from '@learny/db';

import { TestClock, sqlText } from '../test/support/fakes';

import type { ServiceContext } from './context';
import {
  acceptInvitation,
  copyProgrammeForMember,
  createFormationGroup,
  getFormationGroup,
  getInvitationPreview,
  leaveFormationGroup,
  removeMemberFromGroup,
  rotateGroupCode,
} from './formations-a-plusieurs';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  createGroup: vi.fn(),
  rotateInviteCode: vi.fn(),
  removeGroupMember: vi.fn(),
  leaveGroup: vi.fn(),
  findGroupByInviteCode: vi.fn(),
  getGroup: vi.fn(),
  getGroupMembership: vi.fn(),
  joinGroup: vi.fn(),
  listGroupMembers: vi.fn(),
  listGroupProgress: vi.fn(),
  countActiveFormations: vi.fn(),
}));

vi.mock('@learny/jobs', () => ({ emitAfterCommit: mocks.emit }));

vi.mock('@learny/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@learny/db')>();
  return {
    ...actual,
    createGroup: mocks.createGroup,
    rotateInviteCode: mocks.rotateInviteCode,
    removeGroupMember: mocks.removeGroupMember,
    leaveGroup: mocks.leaveGroup,
    findGroupByInviteCode: mocks.findGroupByInviteCode,
    getGroup: mocks.getGroup,
    getGroupMembership: mocks.getGroupMembership,
    joinGroup: mocks.joinGroup,
    listGroupMembers: mocks.listGroupMembers,
    listGroupProgress: mocks.listGroupProgress,
    countActiveFormations: mocks.countActiveFormations,
  };
});

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FORMATION = '33333333-3333-4333-8333-333333333333';
const GROUP = '44444444-4444-4444-8444-444444444444';
const NEW_FORMATION = '55555555-5555-4555-8555-555555555555';
const AT = '2026-11-11T12:20:00Z';

type Handler = (text: string, params: unknown) => unknown[] | undefined;

interface FakeTx {
  tx: never;
  calls: string[];
}

function fakeTx(handlers: readonly Handler[] = []): FakeTx {
  const calls: string[] = [];
  const tx = {
    execute: (query: unknown): Promise<unknown[]> => {
      const text = sqlText(query);
      calls.push(text);
      for (const handler of handlers) {
        const result = handler(text, query);
        if (result !== undefined) return Promise.resolve(result);
      }
      return Promise.resolve([]);
    },
  };
  return { tx: tx as never, calls };
}

function context(fake: FakeTx): ServiceContext & { sdb: never } {
  const system = {
    transaction: (flow: (tx: never) => Promise<unknown>) => flow(fake.tx),
  };
  return {
    userId: USER,
    requestId: 'req-spec-724',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow(fake.tx) } as never,
    clock: new TestClock(AT),
    logger: {} as never,
    sdb: system as never,
  };
}

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP,
    formationId: FORMATION,
    ownerId: USER,
    inviteCode: 'LRN-AB23',
    maxMembers: 10,
    createdAt: new Date(AT),
    codeRotatedAt: new Date(AT),
    ...overrides,
  };
}

function membership(role: 'owner' | 'member', userId = USER): GroupMember {
  return {
    groupId: GROUP,
    userId,
    role,
    memberStatus: 'active',
    joinedAt: new Date(AT),
    leftAt: null,
  };
}

function accessRow(groupId: string | null = GROUP) {
  return {
    id: FORMATION,
    title: 'Comptabilité générale',
    status: 'active',
    owner_id: USER,
    group_id: groupId,
    group_owner_id: groupId === null ? null : USER,
  };
}

function stateHandlers(
  overrides: Partial<{
    access: ReturnType<typeof accessRow>;
    members: GroupMember[];
    progress: unknown[];
  }> = {},
): Handler[] {
  const access = overrides.access ?? accessRow();
  const members = overrides.members ?? [membership('owner')];
  const progress = overrides.progress ?? [
    {
      groupId: GROUP,
      userId: USER,
      firstName: 'Alice',
      currentModulePosition: 1,
      validatedModules: 0,
      streakDays: 12,
    },
  ];
  mocks.getGroup.mockResolvedValue(group());
  mocks.getGroupMembership.mockResolvedValue(membership('owner'));
  mocks.listGroupMembers.mockResolvedValue(members);
  mocks.listGroupProgress.mockResolvedValue(progress);
  return [
    (text) =>
      text.includes('from public.formations f') && text.includes('left join public.groups')
        ? [access]
        : undefined,
    (text) =>
      text.includes('from public.formations f') && text.includes('join public.groups')
        ? [access]
        : undefined,
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emit.mockResolvedValue(undefined);
  mocks.getGroup.mockResolvedValue(group());
  mocks.getGroupMembership.mockResolvedValue(membership('owner'));
  mocks.listGroupMembers.mockResolvedValue([membership('owner')]);
  mocks.listGroupProgress.mockResolvedValue([
    {
      groupId: GROUP,
      userId: USER,
      firstName: 'Alice',
      currentModulePosition: 1,
      validatedModules: 0,
      streakDays: 12,
    },
  ]);
});

describe('[SPEC-724] règles et calculs', () => {
  it('CA-1 — créer un groupe produit un code LRN-XXXX et dix places', async () => {
    const fake = fakeTx(stateHandlers());
    mocks.createGroup.mockResolvedValue(group());
    mocks.listGroupMembers.mockResolvedValue([membership('owner')]);

    const result = await createFormationGroup(context(fake), FORMATION);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.group).toMatchObject({
      inviteCode: 'LRN-AB23',
      maxMembers: 10,
      memberCount: 1,
      canManage: true,
      canLeave: false,
    });
    expect(result.value.group?.inviteCode).toMatch(/^LRN-[A-Z0-9]{4}$/);
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'group/member-joined',
      { groupId: GROUP, formationId: FORMATION, userId: USER },
      { id: `group-member-joined:${GROUP}:${USER}` },
    );
  });

  it('CA-2 — la projection ne contient que les quatre faits publics', async () => {
    const bob = membership('member', OTHER);
    const fake = fakeTx(
      stateHandlers({
        members: [membership('owner'), bob],
        progress: [
          {
            groupId: GROUP,
            userId: USER,
            firstName: 'Alice',
            currentModulePosition: 2,
            validatedModules: 1,
            streakDays: 12,
          },
          {
            groupId: GROUP,
            userId: OTHER,
            firstName: 'Bob',
            currentModulePosition: 1,
            validatedModules: 1,
            streakDays: 7,
          },
        ],
      }),
    );
    mocks.getGroupMembership.mockResolvedValue(membership('member', OTHER));

    const result = await getFormationGroup(context(fake), FORMATION);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const members = result.value.group?.members ?? [];
    expect(members.map((member) => member.firstName)).toEqual(['Alice', 'Bob']);
    expect(
      members.every(
        (member) =>
          Object.keys(member).sort().join(',') ===
          [
            'currentModulePosition',
            'firstName',
            'memberStatus',
            'role',
            'streakDays',
            'userId',
            'validatedModules',
          ]
            .sort()
            .join(','),
      ),
    ).toBe(true);
    expect(JSON.stringify(result.value)).not.toMatch(/@|lacune|apport|cours|note/i);
  });

  it('CA-3 — quitter renvoie la nouvelle formation individuelle', async () => {
    const fake = fakeTx([
      (text) =>
        text.includes('select title') && text.includes('public.formations')
          ? [{ title: 'Comptabilité générale' }]
          : undefined,
    ]);
    mocks.leaveGroup.mockResolvedValue({
      group: group(),
      member: membership('member'),
      copyFormationId: NEW_FORMATION,
    });

    const result = await leaveFormationGroup(context(fake), GROUP);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      formationId: NEW_FORMATION,
      formationTitle: 'Comptabilité générale',
      previousGroupId: GROUP,
    });
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'group/member-left',
      { groupId: GROUP, formationId: FORMATION, userId: USER },
      { id: `group-member-left:${GROUP}:${USER}` },
    );
  });

  it('CA-3 — la copie individuelle recopie le programme et déplace les données privées', async () => {
    const M1 = '66666666-6666-4666-8666-666666666666';
    const NM1 = '77777777-7777-4777-8777-777777777777';
    const N1 = '88888888-8888-4888-8888-888888888888';
    const NN1 = '99999999-9999-4999-8999-999999999999';
    const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const NC1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const fake = fakeTx([
      (text) =>
        text.includes('select title, status') ? [{ title: 'T', status: 'active' }] : undefined,
      (text) =>
        text.includes('insert into public.formations') ? [{ id: NEW_FORMATION }] : undefined,
      (text) => (text.includes('old_notion') ? [{ old_id: N1, new_id: NN1 }] : undefined),
      (text) =>
        text.includes('select oc.id::text as old_id') ? [{ old_id: C1, new_id: NC1 }] : undefined,
      (text) => (text.includes('from public.modules om') ? [{ id: M1, position: 1 }] : undefined),
      (text) =>
        text.includes('from public.modules nm') && text.includes('order by nm.position')
          ? [{ id: NM1, position: 1 }]
          : undefined,
    ]);

    const formationId = await copyProgrammeForMember(fake.tx, {
      sourceFormationId: FORMATION,
      userId: USER,
      now: new Date(AT),
    });

    expect(formationId).toBe(NEW_FORMATION);
    const text = fake.calls.join('\n');
    expect(text).toContain('insert into public.notion_links');
    expect(text).toContain('update public.module_progress');
    expect(text).toContain('update public.courses');
    expect(text).toContain('update public.resources');
    expect(text).toContain('update public.notion_states');
    expect(text).toContain('update public.schedule_slots');
    expect(text).toContain('update public.bricks');
  });

  it('CA-4 — une entrée invalide ne lance aucune écriture', async () => {
    const fake = fakeTx();
    for (const action of [
      () => getFormationGroup(context(fake), 'pas-un-uuid'),
      () => createFormationGroup(context(fake), 'pas-un-uuid'),
      () => rotateGroupCode(context(fake), 'pas-un-uuid'),
      () => leaveFormationGroup(context(fake), 'pas-un-uuid'),
      () => removeMemberFromGroup(context(fake), GROUP, 'pas-un-uuid'),
      () => getInvitationPreview(context(fake), 'LRN-AB1O'),
    ]) {
      const result = await action();
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    }
    expect(fake.calls).toHaveLength(0);
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('CA-4 — un groupe d’un autre apprenant est un 404 sans fuite', async () => {
    const fake = fakeTx([(text) => (text.includes('from public.formations f') ? [] : undefined)]);
    const result = await getFormationGroup(context(fake), FORMATION);
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('CA-4 — une adhésion déjà active ne réécrit rien et n’émet aucun second événement', async () => {
    const fake = fakeTx([
      (text) => (text.includes('select title') ? [{ title: 'Comptabilité générale' }] : undefined),
      (text) => (text.includes('select p.first_name') ? [{ first_name: 'Alice' }] : undefined),
    ]);
    mocks.findGroupByInviteCode.mockResolvedValue(group());
    mocks.getGroupMembership.mockResolvedValue(membership('member'));

    const result = await acceptInvitation(context(fake), 'LRN-AB23');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.memberFirstNames).toEqual(['Alice']);
    expect(mocks.countActiveFormations).not.toHaveBeenCalled();
    expect(mocks.joinGroup).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('CA-4 — une quatrième formation active refuse l’adhésion', async () => {
    const fake = fakeTx();
    mocks.findGroupByInviteCode.mockResolvedValue(group());
    mocks.getGroupMembership.mockResolvedValue(null);
    mocks.countActiveFormations.mockResolvedValue(3);

    const result = await acceptInvitation(context(fake), 'LRN-AB23');

    expect(result).toMatchObject({ ok: false, error: { code: 'FORMATION_LIMIT_REACHED' } });
    expect(mocks.joinGroup).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('CA-4 — la onzième place répond groupe complet', async () => {
    const fake = fakeTx();
    mocks.findGroupByInviteCode.mockResolvedValue(group());
    mocks.getGroupMembership.mockResolvedValue(null);
    mocks.countActiveFormations.mockResolvedValue(1);
    mocks.joinGroup.mockRejectedValue(
      new AppError('CONFLICT', 'Le groupe est complet : dix membres au plus.'),
    );

    const result = await acceptInvitation(context(fake), 'LRN-AB23');

    expect(result).toMatchObject({ ok: false, error: { code: 'GROUP_FULL' } });
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('CA-4 — une adhésion nouvelle initialise la progression et émet un événement stable', async () => {
    const fake = fakeTx([
      (text) => (text.includes('select title') ? [{ title: 'Comptabilité générale' }] : undefined),
      (text) => (text.includes('select p.first_name') ? [{ first_name: 'Alice' }] : undefined),
    ]);
    mocks.findGroupByInviteCode.mockResolvedValue(group());
    mocks.getGroupMembership.mockResolvedValue(null);
    mocks.countActiveFormations.mockResolvedValue(1);
    mocks.joinGroup.mockResolvedValue({
      group: group(),
      member: membership('member'),
      alreadyMember: false,
    });

    const result = await acceptInvitation(context(fake), 'lrn-ab23');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formationTitle).toBe('Comptabilité générale');
    expect(fake.calls.some((text) => text.includes('insert into public.module_progress'))).toBe(
      true,
    );
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'group/member-joined',
      { groupId: GROUP, formationId: FORMATION, userId: USER },
      { id: `group-member-joined:${GROUP}:${USER}` },
    );
  });

  it('CA-3 — régénérer le code invalide l’ancien et le propriétaire seul peut le faire', async () => {
    const fake = fakeTx(stateHandlers());
    mocks.rotateInviteCode.mockResolvedValue(group({ inviteCode: 'LRN-CD45' }));
    mocks.getGroup.mockResolvedValue(group({ inviteCode: 'LRN-CD45' }));
    const rotated = await rotateGroupCode(context(fake), GROUP);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.value.group?.inviteCode).toBe('LRN-CD45');

    mocks.rotateInviteCode.mockRejectedValue(
      new AppError('FORBIDDEN', 'Seul le propriétaire peut régénérer le code.'),
    );
    const refused = await rotateGroupCode(context(fake), GROUP);
    expect(refused).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('CA-3 — retirer un membre émet l’événement de sortie', async () => {
    const bob = membership('member', OTHER);
    const fake = fakeTx(
      stateHandlers({
        members: [membership('owner'), bob],
        progress: [
          {
            groupId: GROUP,
            userId: USER,
            firstName: 'Alice',
            currentModulePosition: 1,
            validatedModules: 0,
            streakDays: 12,
          },
          {
            groupId: GROUP,
            userId: OTHER,
            firstName: 'Bob',
            currentModulePosition: 1,
            validatedModules: 1,
            streakDays: 7,
          },
        ],
      }),
    );
    mocks.removeGroupMember.mockResolvedValue(bob);

    const result = await removeMemberFromGroup(context(fake), GROUP, OTHER);

    expect(result.ok).toBe(true);
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'group/member-left',
      { groupId: GROUP, formationId: FORMATION, userId: OTHER },
      { id: `group-member-left:${GROUP}:${OTHER}` },
    );
  });

  it('CL-5 — le propriétaire ne peut pas quitter son groupe', async () => {
    const fake = fakeTx();
    mocks.leaveGroup.mockRejectedValue(
      new AppError('FORBIDDEN', 'Le propriétaire ne peut pas quitter son groupe.'),
    );
    const result = await leaveFormationGroup(context(fake), GROUP);
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('CL-3 — un aperçu d’invitation ne révèle que le titre et la capacité', async () => {
    const fake = fakeTx([
      (text) =>
        text.includes('select title from public.formations') ? [{ title: 'SAP' }] : undefined,
      (text) => (text.includes('count(*)::int') ? [{ count: 3 }] : undefined),
    ]);
    mocks.findGroupByInviteCode.mockResolvedValue(group());

    const result = await getInvitationPreview(context(fake), 'LRN-AB23');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      code: 'LRN-AB23',
      formationId: FORMATION,
      formationTitle: 'SAP',
      memberCount: 3,
      maxMembers: 10,
      full: false,
    });
    expect(JSON.stringify(result.value)).not.toMatch(/@|lacune|apport|cours/i);
  });

  it('CL-3 — un code inconnu est un 404 neutre', async () => {
    const fake = fakeTx();
    mocks.findGroupByInviteCode.mockResolvedValue(null);
    const result = await getInvitationPreview(context(fake), 'LRN-ZZ99');
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('CL-2 — la copie refuse une formation non active', async () => {
    const fake = fakeTx([
      (text) =>
        text.includes('select title, status') ? [{ title: 'T', status: 'archived' }] : undefined,
    ]);
    await expect(
      copyProgrammeForMember(fake.tx, {
        sourceFormationId: FORMATION,
        userId: USER,
        now: new Date(AT),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('EF-1 — une formation sans groupe expose canCreate au propriétaire actif', async () => {
    const fake = fakeTx([
      (text) => (text.includes('from public.formations f') ? [accessRow(null)] : undefined),
    ]);
    const result = await getFormationGroup(context(fake), FORMATION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ group: null, canCreate: true });
  });
});
