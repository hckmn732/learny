-- Cleanup of the SPEC-3501 quiz seed (SPEC-3501 CA-3).
--
-- The identifiers are the fixed ones of `SPEC-3501-seed-quiz.sql`; the deletion cascades to the
-- answers of the attempt and removes the activity and the brick the seed created. The
-- demonstration dataset (progression, history, other activities) is never touched.
DELETE FROM public.attempts WHERE id = '35010000-0000-4000-8000-000000000001';
DELETE FROM public.activities WHERE id = '35010000-0000-4000-8000-000000000002';
DELETE FROM public.brick_versions WHERE id = '35010000-0000-4000-8000-000000000004';
DELETE FROM public.bricks WHERE id = '35010000-0000-4000-8000-000000000003';

SELECT count(*) AS remaining
FROM public.attempts
WHERE id = '35010000-0000-4000-8000-000000000001';
