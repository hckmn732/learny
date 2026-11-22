"""Closed list of the callers allowed to bypass row-level security (SPEC-2101 EF-4, CA-3).

A service transaction uses the owner role, so a module that opens one sees every row. The list is
the only place where that is allowed; `tests/unit/shared/test_privileged_callers.py` scans the
source and fails on any `service_tx(` call made from a module that is not listed here. Start the
list from the TypeScript `serviceDb()` call sites and add a line only with a written reason.
"""

from types import MappingProxyType
from typing import Final

PRIVILEGED_CALLERS: Final = MappingProxyType(
    {
        # The unit of work itself defines `service_tx`; it holds no business call.
        "learny.shared.db.uow": "defines the service transaction",
        # `rate_limits` has no policy for learners (SPEC-208 ET-4).
        "learny_api.guards.rate_limit": "token buckets of the request pipeline",
        # `idempotency_keys` is a service-only table (SPEC-112 EF-3, ADR-0120).
        "learny_api.guards.idempotency": "idempotency reservations and replays",
        # SPEC-2207 - the personal-data demonstration seeds a programme, schedules the deletion
        # of a throwaway account and creates its own export row with the owner role (EF-9).
        "learny_api.dev_demos.personal_data": "demo programme, throwaway deletion and export row",
        # SPEC-2207 - the notification demonstration simulates settings and tone then restores
        # them, and the push demonstration writes the notification row of the caller (EF-8).
        "learny_api.dev_demos.notifications": "simulated settings and tone of the demonstration",
        "learny_api.dev_demos.push": "notification row of the push demonstration",
        # SPEC-2207 - the rate-limit demonstration owns synthetic buckets and rows it deletes.
        "learny_api.special.dev_rate_limit": "synthetic buckets and rows of the demonstration",
        # SPEC-2207 - the jobs demonstration reads the factory users and the outbox counts.
        "learny_api.special.dev_events": "factory users and outbox counts of the demonstration",
        # The smoothing journal of the daily quiz is an automation proposal (SPEC-718 ET-4).
        "learny.learning.application.review": "quiz smoothing automation journal row",
        # Storage objects and export archives are signed or written with the service role.
        "learny.platform.storage": "signed URLs and export objects",
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
        # SPEC-2205 - `notify` writes the in-app row and the delivery journal of a learner with the
        # owner role, exactly like the TypeScript `sdb` of the notification producers (SPEC-209).
        "learny.engagement.application.notify": "notification producer writes the inbox and the journal",
        # SPEC-2205 - the sender reads the recipient address and tone, and the welcome job checks the
        # e-mail channel, on rows the authenticated role may not read for another purpose (EF-6).
        "learny.engagement.application.email": "recipient address and tone of the e-mail channel",
        # SPEC-2205 - the digest tick reads the agenda and the capped sends of every learner
        # with the owner role, exactly like the TypeScript `sdb` of the job (SPEC-209).
        "learny.engagement.application.digest": "hourly tick of the daily digests",
        # SPEC-2205 - the reminder tick reads and cancels the unsent reminders of every
        # learner, which the authenticated role of one learner cannot do (BR-NOT-07).
        "learny.engagement.application.reminders": "hourly tick of the quiz reminders",
        # SPEC-2205 - the hourly tick expires the pending actions of every learner, on rows the
        # authenticated role of one learner may not update (CL-3, SPEC-711).
        "learny.engagement.application.automations": "hourly tick expires the pending actions",
        # SPEC-2207 - the local-tick fan-out reads the profiles of every active learner with the
        # owner role, exactly like the TypeScript `ctx.sdb` of `cron-hourly-tick` (SPEC-203 ET-5).
        "learny.engagement.application.local_ticks": "hourly fan-out of the local ticks",
        # SPEC-2205 - the pause journals its own action with the service role, exactly like the
        # TypeScript `recordPauseAction` (the RLS policy reserves inserts to that role).
        "learny.engagement.application.pause": "pause journal row written after the commit",
        # SPEC-2206 - the subscription row and the Stripe event journal are read and written with
        # the owner role, exactly like the TypeScript `serviceDb()` of `billing/` (ADR-0215).
        "learny.billing.application.checkout": "subscription row of the Checkout and the portal",
        "learny.billing.application.webhook": "claim of the Stripe event and subscription state",
        # SPEC-2206 - the export request reads the profile time zone and writes the job row and its
        # outbox event with the owner role, like the TypeScript `serviceDb()` (SPEC-211 EF-1).
        "learny.privacy.application.export": "export job row, quota and outbox event",
        # SPEC-2206 - the deletion schedule locks and updates the profile columns (SPEC-211 EF-5).
        "learny.privacy.application.deletion": "deletion schedule of the profile",
        # SPEC-2206 - the data-export job reads and writes the job row with the owner role, like the
        # TypeScript `ctx.sdb` of the Inngest function (SPEC-211 EF-1, ET-2).
        "learny.privacy.application.export_job": "data-export job row and archive finalisation",
        # SPEC-2206 - the nightly account deletion and the purge act on behalf of a learner who may
        # already be gone, so they need the owner role (SPEC-211 EF-7, EF-8).
        "learny.privacy.application.deletion_job": "nightly deletion of due accounts",
        "learny.privacy.application.purge": "nightly purge of expired exports",
        # The worker owns the outbox tables: fanned-out deliveries, claims and completion.
        "learny_worker.dispatcher": "outbox fan-out into job deliveries",
        "learny_worker.runner": "claims, completion and backoff of the deliveries",
        "learny_worker.scheduler": "cron ticks written to the outbox",
        # SPEC-2207 - the planner of the daily digests writes one `job/daily-digest` per due
        # learner in a service transaction, like the TypeScript `step.sendEvent` of the job.
        "learny_worker.consumers": "internal job/daily-digest events of the planned digests",
        "learny_worker.health": "readiness probe of the worker",
        # SPEC-2207 - the nightly cleanup deletes the delivered rows of every learner, which the
        # authenticated role of one learner may not do (SPEC-203 ET-6, ADR-0122).
        "learny.shared.outbox.purge": "nightly cleanup of the delivered outbox rows",
        # SPEC-2207 - the hourly purge deletes the expired security rows of the whole instance;
        # `rate_limits` and `idempotency_keys` are service-only tables (SPEC-208 EF-7, ADR-0258).
        "learny.identity.application.purge_security": "hourly purge of the expired security rows",
        # SPEC-2207 - the nightly purge deletes the receipts of every learner, which the
        # authenticated role of one learner may not do (SPEC-801 ET-6, ADR-0200).
        "learny.assessments.application.offline_purge": "nightly purge of the offline receipts",
        # SPEC-2207 - the initial planning writes the slots of the formation owner after the
        # programme validation, exactly like the TypeScript `ctx.sdb` of the job (SPEC-605 EF-4).
        "learny.learning.application.plan_programme": "initial planning of a validated programme",
        # SPEC-2207 - the unlock writes the `module_validated` milestone, a system-managed row
        # read-only for the authenticated role (SPEC-408 policy, SPEC-612 EF-7).
        "learny.formation.application.unlock_module": "module validation milestone row",
        # SPEC-2207 - the bank jobs read and write the jobs, the bricks and their versions with
        # the owner role, exactly like the TypeScript `store: ctx.sdb.transaction` of the job
        # (SPEC-513 ET-2).
        "learny.tutor.application.question_bank": "question bank jobs, bricks and versions",
    }
)
