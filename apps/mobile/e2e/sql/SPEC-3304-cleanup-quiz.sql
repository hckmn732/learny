-- Cleanup of the SPEC-3304 seed: every row created by seed-quiz.sql, and nothing else.
DO $$
DECLARE
  v_activities uuid[];
  v_attempts uuid[];
  v_versions uuid[];
  v_bricks uuid[];
BEGIN
  SELECT array_agg(id) INTO v_activities
  FROM public.activities WHERE config ->> 'sdd' = 'SPEC-3304';

  SELECT array_agg(id) INTO v_attempts
  FROM public.attempts WHERE activity_id = ANY (COALESCE(v_activities, '{}'));

  SELECT array_agg(DISTINCT brick_version_id) INTO v_versions
  FROM public.answers WHERE attempt_id = ANY (COALESCE(v_attempts, '{}'));

  SELECT array_agg(value::uuid) INTO v_bricks
  FROM public.activities a, jsonb_array_elements_text(a.config -> 'brickIds')
  WHERE a.config ->> 'sdd' = 'SPEC-3304';

  DELETE FROM public.answers WHERE attempt_id = ANY (COALESCE(v_attempts, '{}'));
  DELETE FROM public.attempts WHERE id = ANY (COALESCE(v_attempts, '{}'));
  DELETE FROM public.activities WHERE id = ANY (COALESCE(v_activities, '{}'));
  DELETE FROM public.brick_versions WHERE id = ANY (COALESCE(v_versions, '{}'));
  DELETE FROM public.bricks WHERE id = ANY (COALESCE(v_bricks, '{}'));

  RAISE NOTICE 'nettoyage SPEC-3304 : % activité(s), % tentative(s), % brique(s)',
    COALESCE(array_length(v_activities, 1), 0),
    COALESCE(array_length(v_attempts, 1), 0),
    COALESCE(array_length(v_bricks, 1), 0);
END $$;

SELECT count(*) AS remaining
FROM public.activities WHERE config ->> 'sdd' = 'SPEC-3304';
