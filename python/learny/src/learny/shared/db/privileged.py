"""Closed list of the callers allowed to bypass row-level security (SPEC-2101 EF-4, CA-3).

A service transaction uses the owner role, so a module that opens one sees every row. The list is
the only place where that is allowed; `tests/unit/shared/test_privileged_callers.py` scans the
source and fails on any `service_tx(` call made from a module that is not listed here.
"""

from types import MappingProxyType
from typing import Final

PRIVILEGED_CALLERS: Final = MappingProxyType(
    {
        # The unit of work itself defines `service_tx`; it holds no business call.
        "learny.shared.db.uow": "defines the service transaction",
        # SPEC-2207 - the demonstration pipeline writes synthetic runs of `sdd_demo_runs`, a
        # table without policy for learners (SPEC-203 ET-7, ADR-2014).
        "learny.shared.devtools": "synthetic demonstration runs of the pipeline",
        # SPEC-719 - the sprint engine reads the milestones, the agenda and the journal with the
        # owner role, exactly like `serviceDb()` of `planSprintsBeforeMilestones` (ADR-0190).
        "learny.engagement.application.sprints": "sprint planning engine (SPEC-719)",
        # SPEC-2302 - the factories of the demonstration pages write the owner role fixture of
        # a throwaway account inside a transaction that is always rolled back.
        "learny.shared.devfixtures": "rolled-back fixtures of the demonstration pages",
        # `rate_limits` has no policy for learners (SPEC-208 ET-4).
        "learny_api.guards.rate_limit": "token buckets of the request pipeline",
        # `idempotency_keys` is a service-only table (SPEC-112 EF-3, ADR-0120).
        "learny_api.guards.idempotency": "idempotency reservations and replays",
        # SPEC-2207 - the reminder generation of the e2e harness simulates settings and tone then
        # restores them (EF-8).
        "learny_api.dev_demos.notifications": "simulated settings and tone of the demonstration",
        # SPEC-2207 - the jobs demonstration reads the factory users and the outbox counts.
        "learny_api.special.dev_events": "factory users and outbox counts of the demonstration",
        # The smoothing journal of the daily quiz is an automation proposal (SPEC-718 ET-4).
        "learny.learning.application.review": "quiz smoothing automation journal row",
        # Storage objects and export archives are signed or written with the service role.
        "learny.platform.storage": "signed URLs and export objects",
        # The live AI gateway runs inside jobs too: it reads the caller's own key (scoped by user_id)
        # and appends the call journal, which has no insert policy for learners (BR-IA-08, ADR-4005).
        "learny.platform.llm.live": "BYOK key read and ai_calls journal (ADR-4005)",
        # Admin Auth calls (user creation, deletion) need the service role key.
        "learny.identity.infrastructure.gotrue": "GoTrue admin endpoints",
        # SPEC-2201 - outbox metadata of the cadrage conclusion (ADR-0246)
        "learny.formation.application.cadrage": "outbox metadata of the cadrage conclusion (ADR-0246)",
        # SPEC-2201 - transition events written after the status change
        "learny.formation.application.formations": "transition events written after the status change",
        # SPEC-2201 - invitee has no membership yet (ADR-0246) and member events
        "learny.formation.application.groups": "invitee has no membership yet (ADR-0246) and member events",
        # SPEC-2201 - failed import and adjustment reasons, programme events
        "learny.formation.application.programme": "failed import and adjustment reasons, programme events",
        # SPEC-4001 - the four analysis steps are persisted from the worker, outside any request,
        # and the generation job reads the modules of every member (service scope of the outbox).
        "learny.formation.application.simple.analysis": "analysis steps persisted by the worker (SPEC-4001)",
        "learny.formation.application.simple.generation": "generation modules read by the worker (SPEC-4001)",
        "learny.formation.application.simple.status": "preparation state read by the worker (SPEC-4001)",
        "learny.formation.application.simple.create": "formation lookup shared with the read model (SPEC-4001)",
        # SPEC-2202 - milestones are system-managed and read-only for the authenticated role
        "learny.learning.application.series": "milestone rows are read-only for the authenticated role",
        "learny.learning.application.final_review": "skips the reminders of a stopped interview (ADR-0112)",
        "learny.learning.application.planning": "automation journal of the lightening proposal (BR-AUT-11)",
        # SPEC-2202 - the owner of a session read with the service role answers FORBIDDEN (ET-7).
        "learny.assessments.application.offline_sync": "owner probe of an offline session (ET-7)",
        # SPEC-2203 - telling a missing contribution from another owner's one (EF-6) and the
        # soft deletion of a contribution with its citations, which the authenticated role cannot do.
        "learny.content.application.resources": "owner probe and soft deletion of a contribution",
        # SPEC-2203 - the ingestion job is an authorized system operation (ET-4): it reads a
        # private object, locks the resource and writes the outbox event after the commit.
        "learny.content.application.ingestion": "system ingestion job of a contribution (ET-4)",
        # SPEC-2205 - `notify` writes the in-app row and the delivery journal of a learner with the owner
        # role.
        "learny.engagement.application.notify": "notification producer writes the inbox and the journal",
        # SPEC-2205 - the sender reads the recipient address and tone, and the welcome job checks the
        # e-mail channel, on rows the authenticated role may not read for another purpose (EF-6).
        "learny.engagement.application.email": "recipient address and tone of the e-mail channel",
        # SPEC-2205 - the digest tick reads the agenda and the capped sends of every learner with the owner
        # role.
        "learny.engagement.application.digest": "hourly tick of the daily digests",
        # SPEC-2205 - the reminder tick reads and cancels the unsent reminders of every
        # learner, which the authenticated role of one learner cannot do (BR-NOT-07).
        "learny.engagement.application.reminders": "hourly tick of the quiz reminders",
        # SPEC-2205 - the hourly tick expires the pending actions of every learner, on rows the
        # authenticated role of one learner may not update (CL-3, SPEC-711).
        "learny.engagement.application.automations": "hourly tick expires the pending actions",
        # SPEC-2207 - the local-tick fan-out reads the profiles of every active learner with the owner role.
        "learny.engagement.application.local_ticks": "hourly fan-out of the local ticks",
        # SPEC-2205 - the pause journals its own action with the service role.
        "learny.engagement.application.pause": "pause journal row written after the commit",
        # SPEC-2206 - the subscription row and the Stripe event journal are read and written with the owner
        # role.
        "learny.billing.application.checkout": "subscription row of the Checkout and the portal",
        "learny.billing.application.webhook": "claim of the Stripe event and subscription state",
        # SPEC-2206 - the export request reads the profile time zone and writes the job row and its outbox
        # event with the owner role.
        "learny.privacy.application.export": "export job row, quota and outbox event",
        # SPEC-2206 - the deletion schedule locks and updates the profile columns (SPEC-211 EF-5).
        "learny.privacy.application.deletion": "deletion schedule of the profile",
        # SPEC-2206 - the data-export job reads and writes the job row with the owner role.
        "learny.privacy.application.export_job": "data-export job row and archive finalisation",
        # SPEC-2206 - the nightly account deletion and the purge act on behalf of a learner who may
        # already be gone, so they need the owner role (SPEC-211 EF-7, EF-8).
        "learny.privacy.application.deletion_job": "nightly deletion of due accounts",
        "learny.privacy.application.purge": "nightly purge of expired exports",
        # SPEC-611 CL-6 - the correction of an open answer is a job: it resolves the learner's
        # own `tutor` model outside RLS before calling the provider, like the other job-side
        # resolvers (SPEC-504, BR-IA-02). The correction stays pending without an assignment.
        "learny.assessments.application.grade_open": "job-side resolution of the learner tutor model",
        # The worker owns the outbox tables: fanned-out deliveries, claims and completion.
        "learny_worker.dispatcher": "outbox fan-out into job deliveries",
        "learny_worker.runner": "claims, completion and backoff of the deliveries",
        "learny_worker.scheduler": "cron ticks written to the outbox",
        # SPEC-2207 - the planner of the daily digests writes one `job/daily-digest` per due learner in a
        # service transaction.
        "learny_worker.consumers": "internal job/daily-digest events of the planned digests",
        "learny_worker.health": "readiness probe of the worker",
        "learny_worker.drain": "read-only drain probe of the job tables before a flip",
        # SPEC-2207 - the nightly cleanup deletes the delivered rows of every learner, which the
        # authenticated role of one learner may not do (SPEC-203 ET-6, ADR-0122).
        "learny.shared.outbox.purge": "nightly cleanup of the delivered outbox rows",
        # SPEC-2207 - the hourly purge deletes the expired security rows of the whole instance;
        # `rate_limits` and `idempotency_keys` are service-only tables (SPEC-208 EF-7, ADR-0258).
        "learny.identity.application.purge_security": "hourly purge of the expired security rows",
        # SPEC-2207 - the first verification reads `auth.users` and writes the legal acceptances
        # and the terms of the account with the owner role, exactly like `serviceDb()` in
        "learny.identity.application.auth": "legal acceptances of the first verification",
        # SPEC-2207 - the nightly purge deletes the receipts of every learner, which the
        # authenticated role of one learner may not do (SPEC-801 ET-6, ADR-0200).
        "learny.assessments.application.offline_purge": "nightly purge of the offline receipts",
        # SPEC-2207 - the initial planning writes the slots of the formation owner after the programme
        # validation.
        "learny.learning.application.plan_programme": "initial planning of a validated programme",
        # SPEC-2207 - the unlock writes the `module_validated` milestone, a system-managed row
        # read-only for the authenticated role (SPEC-408 policy, SPEC-612 EF-7).
        "learny.formation.application.unlock_module": "module validation milestone row",
        # SPEC-2207 - the bank jobs read and write the jobs, the bricks and their versions with the owner
        # role.
        "learny.tutor.application.question_bank": "question bank jobs, bricks and versions",
    }
)
