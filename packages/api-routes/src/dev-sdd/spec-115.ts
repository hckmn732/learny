// Owner-role reads of the SPEC-115 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// Every displayed number is measured on the real local database; a missing seed shows « Seed
// absente » instead of a zero or a hard-coded success (EF-8, CA-5). Reads never write.
import { serviceDb, sql } from '@learny/db';
import {
  DEMO_AGENDA_DAYS,
  DEMO_EXPECTED,
  DEMO_FORMATIONS,
  DEMO_GROUP_ID,
  DEMO_NOTIFICATIONS,
  DEMO_PROFILE,
  DEMO_SAP,
  demoFormationId,
  demoUserId,
  type DemoSource,
} from '@learny/db/seed/fixtures';

export interface Spec115Check {
  key: string;
  label: string;
  expected: string;
  observed: string;
  ok: boolean;
  source: DemoSource;
}

export interface Spec115AgendaDay {
  date: string;
  label: string;
  slots: Array<{
    id: string;
    start: string;
    end: string;
    title: string;
    meta: string | null;
    status: string;
    formation: string;
  }>;
}

export interface Spec115Data {
  present: boolean;
  profile: {
    fullName: string;
    email: string;
    timezone: string;
    streakDays: number;
  } | null;
  formations: {
    activeOrProposed: number;
    completed: number;
    titles: Array<{ title: string; status: string; progress: number | null }>;
  };
  sap: { modules: number; chapters: number; notions: number };
  group: { members: number; names: string[] };
  agenda: { days: Spec115AgendaDay[]; slots: number; unread: number };
  checks: Spec115Check[];
}

interface ProfileRow extends Record<string, unknown> {
  first_name: string | null;
  last_name: string | null;
  email: string;
  timezone: string;
  streak_days: number;
}

interface FormationRow extends Record<string, unknown> {
  id: string;
  title: string;
  status: string;
}

interface CountRow extends Record<string, unknown> {
  count: number;
}

interface SlotRow extends Record<string, unknown> {
  id: string;
  start: string;
  end: string;
  title: string;
  meta: string | null;
  status: string;
  formation: string;
  day: string;
}

interface MemberRow extends Record<string, unknown> {
  first_name: string | null;
}

function check(
  key: string,
  label: string,
  expected: number,
  observed: number,
  source: DemoSource,
): Spec115Check {
  return {
    key,
    label,
    expected: String(expected),
    observed: String(observed),
    ok: expected === observed,
    source,
  };
}

const EMPTY: Spec115Data = {
  present: false,
  profile: null,
  formations: { activeOrProposed: 0, completed: 0, titles: [] },
  sap: { modules: 0, chapters: 0, notions: 0 },
  group: { members: 0, names: [] },
  agenda: { days: [], slots: 0, unread: 0 },
  checks: [],
};

export async function loadSpec115Demo(): Promise<Spec115Data> {
  const db = serviceDb();
  const alexId = demoUserId('alex');
  const sapId = demoFormationId('sap');
  const agileId = demoFormationId('agile');

  const profiles = await db.execute<ProfileRow>(sql`
    select first_name, last_name, email, timezone, streak_days
    from public.profiles where id = ${alexId}::uuid
  `);
  const profile = profiles[0];
  if (profile === undefined) return EMPTY;

  const formations = await db.execute<FormationRow>(sql`
    select id::text as id, title, status::text as status
    from public.formations
    where owner_id = ${alexId}::uuid
  `);
  const displayOrder = new Map(DEMO_FORMATIONS.map((formation, index) => [formation.title, index]));
  formations.sort(
    (left, right) => (displayOrder.get(left.title) ?? 99) - (displayOrder.get(right.title) ?? 99),
  );
  const active = formations.filter(
    (row) => row.status === 'active' || row.status === 'programme_proposed',
  ).length;
  const completed = formations.filter((row) => row.status === 'completed').length;

  const sapCounts = await db.execute<{ modules: number; chapters: number; notions: number }>(sql`
    select
      (select count(*)::int from public.modules where formation_id = ${sapId}::uuid) as modules,
      (select count(*)::int from public.chapters where formation_id = ${sapId}::uuid) as chapters,
      (select count(*)::int from public.notions where formation_id = ${sapId}::uuid) as notions
  `);
  const sap = sapCounts[0] ?? { modules: 0, chapters: 0, notions: 0 };

  const groupRows = await db.execute<CountRow>(sql`
    select count(*)::int as count
    from public.group_members
    where group_id = ${DEMO_GROUP_ID}::uuid and left_at is null
  `);
  const members = await db.execute<MemberRow>(sql`
    select p.first_name
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    where m.group_id = ${DEMO_GROUP_ID}::uuid and m.left_at is null
    order by m.role desc, m.joined_at
  `);

  const slots = await db.execute<SlotRow>(sql`
    select
      s.id::text as id,
      to_char(s.starts_at at time zone 'Europe/Paris', 'HH24:MI') as start,
      to_char(s.ends_at at time zone 'Europe/Paris', 'HH24:MI') as end,
      s.title,
      s.meta,
      s.status::text as status,
      f.title as formation,
      to_char((s.starts_at at time zone 'Europe/Paris')::date, 'YYYY-MM-DD') as day
    from public.schedule_slots s
    join public.formations f on f.id = s.formation_id
    where s.user_id = ${alexId}::uuid
      and s.formation_id in (${sapId}::uuid, ${agileId}::uuid)
      and (s.starts_at at time zone 'Europe/Paris')::date
          between date '2026-11-09' and date '2026-11-13'
    order by s.starts_at
  `);

  const days: Spec115AgendaDay[] = DEMO_AGENDA_DAYS.map((day) => ({
    date: day.date,
    label: day.label,
    slots: slots
      .filter((slot) => slot.day === day.date)
      .map((slot) => ({
        id: slot.id,
        start: slot.start,
        end: slot.end,
        title: slot.title,
        meta: slot.meta,
        status: slot.status,
        formation: slot.formation,
      })),
  }));

  const unreadRows = await db.execute<CountRow>(sql`
    select count(*)::int as count from public.notifications
    where user_id = ${alexId}::uuid and read_at is null
  `);
  const unread = unreadRows[0]?.count ?? 0;

  const sapFormation = DEMO_FORMATIONS[0];
  const formationSource = sapFormation?.source ?? DEMO_PROFILE.source;
  const checks: Spec115Check[] = [
    check('sap.modules', 'Modules SAP', DEMO_EXPECTED.sapModules, sap.modules, {
      screen: 'SCR-05',
      file: 'Programme.dc.html',
      element: 'Modules et chapitres',
    }),
    check('sap.notions', 'Notions SAP', DEMO_EXPECTED.sapNotions, sap.notions, {
      screen: 'SCR-14',
      file: 'Carte.dc.html',
      element: 'const N',
    }),
    check(
      'formations.active_or_proposed',
      'Formations en cours ou proposées',
      DEMO_EXPECTED.activeOrProposed,
      active,
      formationSource,
    ),
    check(
      'formations.completed',
      'Formations terminées',
      DEMO_EXPECTED.completed,
      completed,
      formationSource,
    ),
    check(
      'group.members',
      'Membres du groupe',
      DEMO_EXPECTED.groupMembers,
      groupRows[0]?.count ?? 0,
      {
        screen: 'fixture',
        file: 'Main.dc.html',
        element: 'membres du groupe agile',
      },
    ),
    check('agenda.slots', 'Créneaux de la semaine', DEMO_EXPECTED.agendaSlots, slots.length, {
      screen: 'SCR-12',
      file: 'Agenda.dc.html',
      element: 'const week2',
    }),
    check(
      'agenda.days',
      'Jours de l’agenda',
      DEMO_EXPECTED.agendaDays,
      new Set(slots.map((slot) => slot.day)).size,
      {
        screen: 'SCR-12',
        file: 'Agenda.dc.html',
        element: 'semaine du 9 au 13 novembre',
      },
    ),
    check(
      'notifications.unread',
      'Notifications non lues',
      DEMO_EXPECTED.unreadNotifications,
      unread,
      DEMO_NOTIFICATIONS[0]?.source ?? formationSource,
    ),
  ];

  return {
    present: true,
    profile: {
      fullName: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
      email: profile.email,
      timezone: profile.timezone,
      streakDays: profile.streak_days,
    },
    formations: {
      activeOrProposed: active,
      completed,
      titles: formations.map((row) => ({
        title: row.title,
        status: row.status,
        progress:
          DEMO_FORMATIONS.find((formation) => formation.title === row.title)?.progressPercent ??
          null,
      })),
    },
    sap,
    group: {
      members: groupRows[0]?.count ?? 0,
      names: members.map((member) => member.first_name ?? '—'),
    },
    agenda: { days, slots: slots.length, unread },
    checks,
  };
}

export { DEMO_AGENDA_DAYS, DEMO_SAP };
