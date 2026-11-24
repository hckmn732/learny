"""Public surface of the formation context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.formation.application.cadrage import (
    complete_cadrage,
    create_formation,
    get_cadrage_page_state,
    get_cadrage_state,
    list_formations,
    post_cadrage_message,
    update_formation_title,
)
from learny.formation.application.formations import (
    archive_formation,
    build_management_state,
    can_access_formation,
    pause_formation,
    read_management_state,
    resume_formation,
    switch_current_formation,
    to_managed_formation,
)
from learny.formation.application.groups import (
    accept_invitation,
    create_formation_group,
    get_formation_group,
    get_invitation_preview,
    leave_formation_group,
    remove_member_from_group,
    rotate_group_code,
)
from learny.formation.application.notion_graph import get_notion_graph
from learny.formation.application.ports import FormationDeps, Transactions
from learny.formation.application.programme import (
    adjust_proposal,
    build_proposal_dto,
    generate_proposal,
    get_programme_state,
    import_proposal,
    local_day,
    read_active_programme,
    read_programme_state,
    validate_proposal,
)
from learny.formation.application.search import search_user_content
from learny.formation.application.simple.analysis import launch_analysis, run_analysis
from learny.formation.application.simple.create import create_simple_formation
from learny.formation.application.simple.diagnostic import (
    apply_acquired_modules,
    create_diagnostic,
    skip_diagnostic,
)
from learny.formation.application.simple.generation import list_generation_modules
from learny.formation.application.simple.sources import (
    create_simple_link,
    create_simple_upload,
    set_resource_role,
)
from learny.formation.application.simple.status import read_simple_state
from learny.formation.application.tutor import TutorProfile, build_tutor_prompt
from learny.formation.application.unlock_module import unlock_module
from learny.formation.domain import cadrage as cadrage_rules
from learny.formation.domain import groups as group_rules
from learny.formation.domain import programme as programme_rules
from learny.formation.domain import search as search_rules
from learny.formation.domain.active_limit import (
    MAX_ACTIVE_FORMATIONS,
    active_formations_for_limit,
    active_limit_decision,
    next_current_formation,
    transition_for,
)
from learny.formation.domain.cadrage import CADRAGE_ERROR_MESSAGES, cadrage_error_message

__all__ = [
    "CADRAGE_ERROR_MESSAGES",
    "MAX_ACTIVE_FORMATIONS",
    "FormationDeps",
    "Transactions",
    "TutorProfile",
    "accept_invitation",
    "active_formations_for_limit",
    "active_limit_decision",
    "adjust_proposal",
    "apply_acquired_modules",
    "archive_formation",
    "build_management_state",
    "build_proposal_dto",
    "build_tutor_prompt",
    "cadrage_error_message",
    "cadrage_rules",
    "can_access_formation",
    "complete_cadrage",
    "create_diagnostic",
    "create_formation",
    "create_formation_group",
    "create_simple_formation",
    "create_simple_link",
    "create_simple_upload",
    "generate_proposal",
    "get_cadrage_page_state",
    "get_cadrage_state",
    "get_formation_group",
    "get_invitation_preview",
    "get_notion_graph",
    "get_programme_state",
    "group_rules",
    "import_proposal",
    "launch_analysis",
    "leave_formation_group",
    "list_formations",
    "list_generation_modules",
    "local_day",
    "next_current_formation",
    "pause_formation",
    "post_cadrage_message",
    "programme_rules",
    "read_active_programme",
    "read_management_state",
    "read_programme_state",
    "read_simple_state",
    "remove_member_from_group",
    "resume_formation",
    "rotate_group_code",
    "run_analysis",
    "search_rules",
    "search_user_content",
    "set_resource_role",
    "skip_diagnostic",
    "switch_current_formation",
    "to_managed_formation",
    "transition_for",
    "unlock_module",
    "update_formation_title",
    "validate_proposal",
]
