import { z } from 'zod';

/** Mirrors the `citation_media` enumeration used to render the source chip. */
export const COURSE_CITATION_MEDIA = ['pdf', 'audio', 'video', 'web', 'note', 'image'] as const;
export const CourseCitationMedia = z.enum(COURSE_CITATION_MEDIA);
export type CourseCitationMedia = z.infer<typeof CourseCitationMedia>;
