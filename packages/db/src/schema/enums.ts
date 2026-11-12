// Cross-domain enumerations (SPEC-101 ET-3). Domain enumerations are declared by the
// specification that introduces them (ADR-0113). Values are English snake_case.
import { pgEnum } from 'drizzle-orm/pg-core';

export const courseLanguage = pgEnum('course_language', ['fr', 'en', 'es', 'de']);
export const actor = pgEnum('actor', ['tutor', 'learner', 'import']);
export const contentOrigin = pgEnum('content_origin', ['resource', 'tutor']);
export const jobStatus = pgEnum('job_status', ['queued', 'running', 'done', 'failed']);

/** TypeScript constants mirroring the Postgres enumerations, for contracts and validations. */
export const COURSE_LANGUAGES = courseLanguage.enumValues;
export const ACTORS = actor.enumValues;
export const CONTENT_ORIGINS = contentOrigin.enumValues;
export const JOB_STATUSES = jobStatus.enumValues;

export type CourseLanguage = (typeof COURSE_LANGUAGES)[number];
export type Actor = (typeof ACTORS)[number];
export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
