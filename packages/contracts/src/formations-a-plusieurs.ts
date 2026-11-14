import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of shared formations (SPEC-724 EF-1 to EF-5, ET-1 to ET-5; BR-GRP-01 to BR-GRP-05,
// BR-APP-03, ADR-0035). The DTOs deliberately stop at the four facts the group page may show about
// another member — first name, current module, validated modules and streak — plus the strict
// minimum needed to render the membership (identifier, role and status). No e-mail, note, gap,
// resource, course or discussion ever enters these schemas (BR-GRP-03, ET-5).

/** BR-GRP-01, ET-4 — the invitation code is `LRN-` followed by four unambiguous characters. */
export const GROUP_INVITE_CODE_EXPRESSION = /^LRN-[A-Z2-9]{4}$/;
export const InvitationCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GROUP_INVITE_CODE_EXPRESSION, {
    message: 'le code d’invitation doit respecter le format LRN-XXXX',
  })
  .describe('Code d’invitation `LRN-XXXX` (lettres et chiffres, sans caractère ambigu).');
export type InvitationCode = z.infer<typeof InvitationCode>;

export const GROUP_ROLES = ['owner', 'member'] as const;
export const GroupViewerRole = z.enum(GROUP_ROLES);
export type GroupViewerRole = z.infer<typeof GroupViewerRole>;

export const GROUP_MEMBER_STATUSES = ['active', 'paused', 'completed'] as const;
export const GroupMemberStatus = z.enum(GROUP_MEMBER_STATUSES);
export type GroupMemberStatus = z.infer<typeof GroupMemberStatus>;

/** BR-GRP-01 — ten seats, owner included. */
export const GROUP_MAX_MEMBERS = 10;

/**
 * BR-GRP-03, ET-5 — the only public facts about a member. `userId` identifies the row and the role
 * lets the page mark the owner; neither reveals a personal result.
 */
export const GroupMemberView = z
  .strictObject({
    userId: Uuid,
    firstName: z.string().min(1).max(60).nullable(),
    role: GroupViewerRole,
    memberStatus: GroupMemberStatus,
    currentModulePosition: z.int().min(0),
    validatedModules: z.int().min(0),
    streakDays: z.int().min(0),
  })
  .describe(
    'Membre d’un groupe : prénom, module en cours, modules validés et série seulement (BR-GRP-03).',
  );
export type GroupMemberView = z.infer<typeof GroupMemberView>;

/** ET-3, EF-3 — one group as the caller may read it, members already projected. */
export const GroupDto = z
  .strictObject({
    id: Uuid,
    formationId: Uuid,
    formationTitle: z.string().min(1).max(120),
    inviteCode: InvitationCode,
    inviteLink: z
      .string()
      .regex(/^\/invitation\/LRN-[A-Z2-9]{4}$/, { message: 'lien d’invitation invalide' }),
    maxMembers: z.int().min(2).max(GROUP_MAX_MEMBERS),
    memberCount: z.int().min(1).max(GROUP_MAX_MEMBERS),
    ownerId: Uuid,
    viewerRole: GroupViewerRole,
    /** BR-GRP-05 — only the owner rotates the code, removes a member or changes the programme. */
    canManage: z.boolean(),
    /** CL-5 — the owner cannot leave without a transfer, out of V1 scope. */
    canLeave: z.boolean(),
    members: z.array(GroupMemberView).min(1).max(GROUP_MAX_MEMBERS),
  })
  .describe(
    'Groupe d’une formation partagée, avec sa capacité et la projection limitée de ses membres.',
  );
export type GroupDto = z.infer<typeof GroupDto>;

export const FORMATION_GROUP_STATUSES = [
  'cadrage',
  'programme_proposed',
  'active',
  'paused',
  'completed',
  'archived',
] as const;
export const FormationGroupStatus = z.enum(FORMATION_GROUP_STATUSES);
export type FormationGroupStatus = z.infer<typeof FormationGroupStatus>;

/**
 * EF-1 — `GET /formations/:fid/group`. `group` is null only for the owner of an active formation
 * that has not created its group yet; a non-member never reaches this state (404, CL-1).
 */
export const GroupState = z
  .strictObject({
    formationId: Uuid,
    formationTitle: z.string().min(1).max(120),
    formationStatus: FormationGroupStatus,
    group: GroupDto.nullable(),
    /** BR-GRP-01 — the active formation of the owner can still become a shared formation. */
    canCreate: z.boolean(),
  })
  .describe('État du groupe d’une formation : aucun groupe encore, ou groupe actif.');
export type GroupState = z.infer<typeof GroupState>;

/** ET-3 — public preview of an invitation; never the members' personal data. */
export const InvitationPreview = z
  .strictObject({
    code: InvitationCode,
    formationId: Uuid,
    formationTitle: z.string().min(1).max(120),
    memberCount: z.int().min(1).max(GROUP_MAX_MEMBERS),
    maxMembers: z.int().min(2).max(GROUP_MAX_MEMBERS),
    full: z.boolean(),
  })
  .describe('Aperçu public minimal d’une invitation : titre de formation et capacité.');
export type InvitationPreview = z.infer<typeof InvitationPreview>;

/** EF-2 — result of an acceptance; the onboarding screen already consumes this shape. */
export const InvitationAccepted = z
  .strictObject({
    formationId: Uuid,
    formationTitle: z.string().min(1).max(120),
    /** First names of the other active members, at most nine, for the welcome sentence. */
    memberFirstNames: z.array(z.string().min(1).max(60)).max(GROUP_MAX_MEMBERS - 1),
  })
  .describe('Invitation acceptée : formation partagée et prénoms des autres membres.');
export type InvitationAccepted = z.infer<typeof InvitationAccepted>;

/** EF-4 — leaving creates the individual copy; the page can open it immediately. */
export const GroupLeaveResult = z
  .strictObject({
    formationId: Uuid,
    formationTitle: z.string().min(1).max(120),
    previousGroupId: Uuid,
    leftAt: IsoDateTime,
  })
  .describe('Sortie d’un groupe : nouvelle formation individuelle et historique privé conservé.');
export type GroupLeaveResult = z.infer<typeof GroupLeaveResult>;

/** ET-1 — path identifiers are UUIDs; a malformed value is a 400 with no write. */
export const FormationGroupParams = z.strictObject({ fid: Uuid });
export const GroupParams = z.strictObject({ gid: Uuid });
export const GroupMemberParams = z.strictObject({ gid: Uuid, uid: Uuid });
export const InvitationParams = z.strictObject({ code: InvitationCode });

const GROUP_ERRORS = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'GROUP_FULL',
  'FORMATION_LIMIT_REACHED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_IN_PROGRESS',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

/** ET-3 — `POST /api/v1/formations/:fid/group` (BR-GRP-01). */
export const formationGroupCreate = defineRoute({
  id: 'formations.group.create',
  method: 'POST',
  path: '/api/v1/formations/:fid/group',
  auth: 'user',
  params: FormationGroupParams,
  output: GroupState,
  successStatus: 201,
  idempotent: true,
  summary:
    'Crée le groupe d’une formation active : code LRN-XXXX, lien et dix places (SPEC-724, BR-GRP-01).',
  errors: [...GROUP_ERRORS],
});

/** ET-3 — `GET /api/v1/formations/:fid/group`; a group of another learner is a 404. */
export const formationGroupGet = defineRoute({
  id: 'formations.group.get',
  method: 'GET',
  path: '/api/v1/formations/:fid/group',
  auth: 'user',
  params: FormationGroupParams,
  output: GroupState,
  successStatus: 200,
  summary: 'Lit l’état du groupe et la projection limitée des membres (SPEC-724, BR-GRP-03).',
  errors: [...GROUP_ERRORS],
});

/** ET-3, BR-GRP-05 — `POST /api/v1/groups/:gid/rotate-code`; the old code dies immediately. */
export const groupRotateCode = defineRoute({
  id: 'groups.rotateCode',
  method: 'POST',
  path: '/api/v1/groups/:gid/rotate-code',
  auth: 'user',
  params: GroupParams,
  output: GroupState,
  successStatus: 200,
  idempotent: true,
  summary:
    'Régénère le code d’invitation d’un groupe ; le précédent cesse immédiatement (SPEC-724).',
  errors: [...GROUP_ERRORS],
});

/** ET-3, BR-GRP-05 — `DELETE /api/v1/groups/:gid/members/:uid` (owner only). */
export const groupMemberRemove = defineRoute({
  id: 'groups.members.remove',
  method: 'DELETE',
  path: '/api/v1/groups/:gid/members/:uid',
  auth: 'user',
  params: GroupMemberParams,
  output: GroupState,
  successStatus: 200,
  summary:
    'Retire un membre du groupe et lui laisse une copie individuelle de son programme (SPEC-724).',
  errors: [...GROUP_ERRORS],
});

/** ET-3 — public preview of an invitation; a rotated code is a 404 without leaking the group. */
export const invitationGet = defineRoute({
  id: 'invitations.get',
  method: 'GET',
  path: '/api/v1/invitations/:code',
  auth: 'public',
  params: InvitationParams,
  output: InvitationPreview,
  successStatus: 200,
  summary: 'Aperçu public minimal d’une invitation : titre de formation et capacité (SPEC-724).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR'],
});

/** ET-3 — joining applies the three-active-formations limit and the ten-seat capacity. */
export const invitationAccept = defineRoute({
  id: 'invitations.accept',
  method: 'POST',
  path: '/api/v1/invitations/:code/accept',
  auth: 'user',
  params: InvitationParams,
  output: InvitationAccepted,
  successStatus: 200,
  idempotent: true,
  summary:
    'Rejoint une formation partagée par son code ; le programme devient commun, les données restent privées (SPEC-724).',
  errors: [...GROUP_ERRORS],
});

/** ET-3, BR-GRP-05 — a member leaves and keeps a private individual copy. */
export const groupLeave = defineRoute({
  id: 'groups.leave',
  method: 'POST',
  path: '/api/v1/groups/:gid/leave',
  auth: 'user',
  params: GroupParams,
  output: GroupLeaveResult,
  successStatus: 200,
  idempotent: true,
  summary:
    'Quitte un groupe : copie individuelle du programme et historique privé conservé (SPEC-724).',
  errors: [...GROUP_ERRORS],
});

export const formationGroupRoutes = {
  formationGroupCreate,
  formationGroupGet,
} as const;

export const groupRoutes = {
  groupRotateCode,
  groupMemberRemove,
  groupLeave,
} as const;

export const invitationRoutes = {
  invitationGet,
  invitationAccept,
} as const;

export const formationsAPlusieursRoutes = {
  ...formationGroupRoutes,
  ...groupRoutes,
  ...invitationRoutes,
} as const;
