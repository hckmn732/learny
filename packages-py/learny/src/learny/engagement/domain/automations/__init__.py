"""Pure rules of the automation engine of the engagement context (SPEC-2205).

Ported from `packages/automations` and the automation contracts: the closed vocabularies, the
canonical parameter schemas, the one-line summaries, the stable journal order, the expiration rule,
the local weeks, the weekly-review labels and the global-pause wording. No IO, no framework, and the
instant always comes from the caller (ADR-0047).
"""

from learny.engagement.domain.automations.expiry import is_due_for_expiry
from learny.engagement.domain.automations.journal import (
    JournalEntry,
    decode_cursor,
    encode_cursor,
    sort_actions,
    week_journal,
)
from learny.engagement.domain.automations.keys import (
    ACTION_STATUSES,
    AUTOMATION_KEYS,
    KIND_MAX,
    PAUSE_EXEMPT_KEYS,
    SUMMARY_MAX,
    is_action_kind,
    is_action_status,
    is_automation_key,
)
from learny.engagement.domain.automations.model import (
    ActionDraft,
    ActionView,
    AppliedEffect,
    AutomationDefinition,
    DraftDecision,
    DraftError,
    EffectContext,
    NotificationDraft,
)
from learny.engagement.domain.automations.params import (
    ParamsError,
    default_params,
    params_or_stored,
    validate_params,
)
from learny.engagement.domain.automations.pause import (
    DIAGNOSTIC_MINUTES,
    PAUSE_SHIFT_DAYS,
    pause_end_date_in_zone,
    pause_summary,
    shift_day,
    validate_pause_end_date,
)
from learny.engagement.domain.automations.registry import (
    AutomationRegistry,
    create_registry,
    is_iso_instant,
    validate_draft,
)
from learny.engagement.domain.automations.summary import clip, explain_line, normalize_summary, status_prefix
from learny.engagement.domain.automations.week import (
    WeeklyReviewWeek,
    iso_week_key,
    start_of_user_week,
    weekly_review_week,
)
from learny.engagement.domain.automations.weekly import (
    AT_RISK_MASTERY,
    format_weekly_study,
    is_at_risk_notion,
    sort_at_risk_notions,
    sum_plan_minutes,
    weekly_period_label,
    weekly_received_label,
    weekly_retention_label,
)

__all__ = [
    "ACTION_STATUSES",
    "AT_RISK_MASTERY",
    "AUTOMATION_KEYS",
    "DIAGNOSTIC_MINUTES",
    "KIND_MAX",
    "PAUSE_EXEMPT_KEYS",
    "PAUSE_SHIFT_DAYS",
    "SUMMARY_MAX",
    "ActionDraft",
    "ActionView",
    "AppliedEffect",
    "AutomationDefinition",
    "AutomationRegistry",
    "DraftDecision",
    "DraftError",
    "EffectContext",
    "JournalEntry",
    "NotificationDraft",
    "ParamsError",
    "WeeklyReviewWeek",
    "clip",
    "create_registry",
    "decode_cursor",
    "default_params",
    "encode_cursor",
    "explain_line",
    "format_weekly_study",
    "is_action_kind",
    "is_action_status",
    "is_at_risk_notion",
    "is_automation_key",
    "is_due_for_expiry",
    "is_iso_instant",
    "iso_week_key",
    "normalize_summary",
    "params_or_stored",
    "pause_end_date_in_zone",
    "pause_summary",
    "shift_day",
    "sort_actions",
    "sort_at_risk_notions",
    "start_of_user_week",
    "status_prefix",
    "sum_plan_minutes",
    "validate_draft",
    "validate_params",
    "validate_pause_end_date",
    "week_journal",
    "weekly_period_label",
    "weekly_received_label",
    "weekly_retention_label",
    "weekly_review_week",
]
