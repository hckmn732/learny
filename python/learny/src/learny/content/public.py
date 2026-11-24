"""Public surface of the content context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.content.application.chapters import chapter_counts, complete_chapter
from learny.content.application.citations import get_citation_source
from learny.content.application.course import get_module_course
from learny.content.application.dev_uploads import simulate_upload
from learny.content.application.generate import generate_course_now
from learny.content.application.ingestion import (
    IngestionPorts,
    default_ports,
    process_resource,
)
from learny.content.application.module_screen import get_module_screen
from learny.content.application.ports import ContentDeps
from learny.content.application.progress import (
    assert_uuid,
    course_percent,
    estimate_reading_minutes,
    merge_progress,
    reading_percent,
    record_course_progress,
)
from learny.content.application.resources import (
    create_resource,
    create_upload,
    delete_resource,
    deny_or_missing,
    finalize_upload,
    get_signed_read_url,
    rename_resource,
    retry_resource,
    uploaded_event_id,
)
from learny.content.application.section_detection import (
    DocumentSection,
    detect_sections,
    read_pdf_bookmarks,
)
from learny.content.application.sections import (
    edit_course_section,
    reactivate_bricks,
    report_course_section,
    suspend_bricks_for_notions,
)
from learny.content.application.suggestions import dismiss_suggestion, import_suggestion
from learny.content.application.summary import (
    CourseSummaryFeedback,
    correct_chapter_summary,
    submit_chapter_summary,
)
from learny.content.domain.chunk import chunk_text, excerpt_of
from learny.content.domain.embeddings import embed_texts, fake_embedding
from learny.content.domain.retrieval import (
    deduplicate_chunks,
    format_document_chunk,
    select_context,
    text_overlap_ratio,
)
from learny.content.infrastructure.queries import list_resource_chunks

__all__ = [
    "ContentDeps",
    "CourseSummaryFeedback",
    "DocumentSection",
    "IngestionPorts",
    "assert_uuid",
    "chapter_counts",
    "chunk_text",
    "complete_chapter",
    "correct_chapter_summary",
    "course_percent",
    "create_resource",
    "create_upload",
    "deduplicate_chunks",
    "default_ports",
    "delete_resource",
    "deny_or_missing",
    "detect_sections",
    "dismiss_suggestion",
    "edit_course_section",
    "embed_texts",
    "estimate_reading_minutes",
    "excerpt_of",
    "fake_embedding",
    "finalize_upload",
    "format_document_chunk",
    "generate_course_now",
    "get_citation_source",
    "get_module_course",
    "get_module_screen",
    "get_signed_read_url",
    "import_suggestion",
    "list_resource_chunks",
    "merge_progress",
    "process_resource",
    "reactivate_bricks",
    "read_pdf_bookmarks",
    "reading_percent",
    "record_course_progress",
    "rename_resource",
    "report_course_section",
    "retry_resource",
    "select_context",
    "simulate_upload",
    "submit_chapter_summary",
    "suspend_bricks_for_notions",
    "text_overlap_ratio",
    "uploaded_event_id",
]
