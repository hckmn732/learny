"""Public surface of the tutor context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.tutor.application.byok import (
    create_credential,
    delete_credential,
    discover_credential_models,
    get_models_state,
    list_credentials,
    qualify_credential,
    update_models,
)
from learny.tutor.application.conversations import (
    ConversationRef,
    conversation_by_id,
    create_conversation,
    list_conversations,
)
from learny.tutor.application.question_bank import (
    BankPorts,
    prepare_question_bank,
    process_question_bank_jobs,
)
from learny.tutor.application.self_test import answer_self_test
from learny.tutor.application.stream import stream_reply
from learny.tutor.domain.ai_credentials import (
    create_body_issues,
    discover_body_issues,
    models_update_issues,
)
from learny.tutor.domain.starters import confusion_of, starters_of

__all__ = [
    "BankPorts",
    "ConversationRef",
    "answer_self_test",
    "confusion_of",
    "conversation_by_id",
    "create_body_issues",
    "create_conversation",
    "create_credential",
    "delete_credential",
    "discover_body_issues",
    "discover_credential_models",
    "get_models_state",
    "list_conversations",
    "list_credentials",
    "models_update_issues",
    "prepare_question_bank",
    "process_question_bank_jobs",
    "qualify_credential",
    "starters_of",
    "stream_reply",
    "update_models",
]
