"""[SPEC-2207] Thin adapters of the `dev.*` operations (no logic).

Each handler forwards to the development use case of its family. The special registry wraps these
same handlers with the development guard, so a call is served exactly like `devRoute` in
`packages/api-routes/src/special/dev-routes.ts`.
"""

from typing import Any

from learny_api.dev_demos import notifications, personal_data, push, sdd, sdd_state
from learny_api.pipeline import Call, handler
from learny_api.special import (
    dev_echo,
    dev_email,
    dev_events,
    dev_rate_limit,
    dev_stripe,
    dev_upload,
)


@handler("dev.echo")
async def echo(call: Call) -> dict[str, Any]:
    return await dev_echo.echo(call)


@handler("dev.items")
async def items(call: Call) -> dict[str, Any]:
    return await dev_echo.items(call)


@handler("dev.rateLimit.burst")
async def rate_limit_burst(call: Call) -> dict[str, Any]:
    return await dev_rate_limit.burst(call)


@handler("dev.rateLimit.origin")
async def rate_limit_origin(call: Call) -> dict[str, Any]:
    return await dev_rate_limit.origin(call)


@handler("dev.rateLimit.purge")
async def rate_limit_purge(call: Call) -> dict[str, Any]:
    return await dev_rate_limit.purge_demo(call)


@handler("dev.email.outbox")
async def email_outbox(call: Call) -> dict[str, Any]:
    return await dev_email.outbox(call)


@handler("dev.email.outbox.purge")
async def email_outbox_purge(call: Call) -> dict[str, Any]:
    return await dev_email.purge(call)


@handler("dev.email.preview")
async def email_preview(call: Call) -> Any:
    return await dev_email.preview(call)


@handler("dev.email.send")
async def email_send(call: Call) -> dict[str, Any]:
    return await dev_email.send(call)


@handler("dev.stripe.checkoutCancel")
async def stripe_checkout_cancel(call: Call) -> dict[str, Any]:
    return await dev_stripe.checkout_cancel(call)


@handler("dev.stripe.checkoutPay")
async def stripe_checkout_pay(call: Call) -> dict[str, Any]:
    return await dev_stripe.checkout_pay(call)


@handler("dev.stripe.events")
async def stripe_events(call: Call) -> dict[str, Any]:
    return await dev_stripe.events(call)


@handler("dev.stripe.simulate")
async def stripe_simulate(call: Call) -> dict[str, Any]:
    return await dev_stripe.simulate(call)


@handler("dev.uploadSimulation")
async def upload_simulation(call: Call) -> dict[str, Any]:
    return await dev_upload.uploads(call)


@handler("dev.cron.hourlyTick")
async def cron_hourly_tick(call: Call) -> dict[str, Any]:
    return await dev_events.tick(call)


@handler("dev.events.demo.run")
async def events_demo_run(call: Call) -> dict[str, Any]:
    return await dev_events.run(call)


@handler("dev.events.demo.start")
async def events_demo_start(call: Call) -> dict[str, Any]:
    return await dev_events.start(call)


@handler("dev.events.outbox")
async def events_outbox(call: Call) -> dict[str, Any]:
    return await dev_events.outbox(call)


@handler("dev.personal-data.deletion.schedule")
async def personal_data_deletion_schedule(call: Call) -> dict[str, Any]:
    return await personal_data.schedule(call)


@handler("dev.personal-data.deletion.cancel")
async def personal_data_deletion_cancel(call: Call) -> dict[str, Any]:
    return await personal_data.cancel(call)


@handler("dev.personal-data.execute")
async def personal_data_execute(call: Call) -> dict[str, Any]:
    return await personal_data.execute(call)


@handler("dev.personal-data.export")
async def personal_data_export(call: Call) -> dict[str, Any]:
    return await personal_data.run_export(call)


@handler("dev.notify")
async def dev_notify(call: Call) -> dict[str, Any]:
    return await notifications.run_notify(call)


@handler("dev.notificationsGenerate")
async def dev_notifications_generate(call: Call) -> dict[str, Any]:
    return await notifications.generate(call)


@handler("dev.pushSend")
async def dev_push_send(call: Call) -> dict[str, Any]:
    return await push.send(call)


@handler("dev.sddApiCoverage")
async def dev_sdd_api_coverage(call: Call) -> dict[str, Any]:
    return await sdd.api_coverage(call)


@handler("dev.sddAuthProxy")
async def dev_sdd_auth_proxy(call: Call) -> dict[str, Any]:
    return await sdd.auth_proxy(call)


@handler("dev.sdd.stripe.session")
async def dev_sdd_stripe_session(call: Call) -> dict[str, Any]:
    return await sdd.stripe_session(call)


@handler("dev.sdd.spec-007.demo")
async def dev_spec_007_demo(call: Call) -> dict[str, Any]:
    return await sdd.spec_007(call)


@handler("dev.sdd.spec-1004.demo")
async def dev_spec_1004_demo(call: Call) -> dict[str, Any]:
    return await sdd.spec_1004(call)


@handler("dev.sdd.spec-110.demo")
async def dev_spec_110_demo(call: Call) -> dict[str, Any]:
    return await sdd.spec_110(call)


@handler("dev.sdd.spec-114.demo")
async def dev_spec_114_demo(call: Call) -> dict[str, Any]:
    return await sdd.spec_114(call)


@handler("dev.sdd.spec-1203.demo")
async def dev_spec_1203_demo(call: Call) -> dict[str, Any]:
    return await sdd.spec_1203(call)


@handler("dev.sdd.spec-101.demo")
async def dev_spec_101_demo(call: Call) -> dict[str, Any]:
    return await sdd_state.spec_101(call)


@handler("dev.sdd.spec-102.demo")
async def dev_spec_102_demo(call: Call) -> Any:
    return await sdd_state.spec_102(call)


@handler("dev.sdd.spec-102.create")
async def dev_spec_102_create(call: Call) -> Any:
    return await sdd_state.spec_102_create(call)


@handler("dev.sdd.spec-102.remove")
async def dev_spec_102_remove(call: Call) -> Any:
    return await sdd_state.spec_102_remove(call)


@handler("dev.sdd.spec-109.demo")
async def dev_spec_109_demo(call: Call) -> dict[str, Any]:
    return await sdd_state.spec_109(call)


@handler("dev.sdd.spec-202.demo")
async def dev_spec_202_demo(call: Call) -> dict[str, Any]:
    return await sdd_state.spec_202(call)


@handler("dev.sdd.spec-505.demo")
async def dev_spec_505_demo(call: Call) -> dict[str, Any]:
    return await sdd_state.spec_505(call)
