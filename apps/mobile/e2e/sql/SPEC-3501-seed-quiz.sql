-- Seed of one in-progress validation quiz for the Maestro campaign (SPEC-3501 CA-3).
--
-- The notification of the toucher flow carries the internal destination `/quiz/<attempt>`, which is
-- the route of the mobile quiz screen. The identifiers are **fixed** so the flow can name the
-- destination without interpolation, and the marker `sdd = SPEC-3501` lets the cleanup below remove
-- exactly this seed. The demonstration question bank is never regenerated, so the attempt and its
-- ten answers are written here, like `SPEC-3304-seed-quiz.sql` does for its own screen.
DO $$
DECLARE
  v_user uuid;
  v_formation uuid;
  v_module uuid;
  v_notions uuid[];
  v_notion uuid;
  v_payload jsonb;
  v_items jsonb := '[]'::jsonb;
  v_bricks jsonb := '[]'::jsonb;
  v_brick uuid := '35010000-0000-4000-8000-000000000003';
  v_version uuid := '35010000-0000-4000-8000-000000000004';
  v_activity uuid := '35010000-0000-4000-8000-000000000002';
  v_attempt uuid := '35010000-0000-4000-8000-000000000001';
  i integer;
BEGIN
  DELETE FROM public.activities WHERE id = v_activity;
  DELETE FROM public.bricks WHERE id = v_brick;

  SELECT u.id, p.current_formation_id INTO v_user, v_formation
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email = 'alex.perrin@demo.learny.test';

  SELECT id INTO v_module
  FROM public.modules
  WHERE formation_id = v_formation AND position = 3;

  SELECT array_agg(id ORDER BY position) INTO v_notions
  FROM public.notions WHERE module_id = v_module;

  IF v_user IS NULL OR v_module IS NULL OR v_notions IS NULL THEN
    RAISE EXCEPTION 'contexte de démonstration introuvable';
  END IF;

  INSERT INTO public.activities (id, owner_id, formation_id, module_id, kind, config, items, status)
  VALUES (
    v_activity, v_user, v_formation, v_module, 'validation_quiz',
    jsonb_build_object('threshold', 80, 'questionCount', 10, 'scoring', 'equal', 'sdd', 'SPEC-3501'),
    '[]'::jsonb, 'draft'
  );

  INSERT INTO public.attempts (id, user_id, activity_id, attempt_no, status, started_at)
  VALUES (v_attempt, v_user, v_activity, 1, 'in_progress', '2026-11-11T12:20:00Z');

  INSERT INTO public.bricks (id, owner_id, formation_id, type, notion_ids, purpose, status, current_version)
  VALUES (v_brick, v_user, v_formation, 'choice_question', ARRAY[v_notions[1]], 'validation', 'active', 1);

  FOR i IN 1..10 LOOP
    v_notion := v_notions[1 + ((i - 1) % array_length(v_notions, 1))];
    v_payload := jsonb_build_object(
      'stem', 'Une facture fournisseur est enregistrée le 12 novembre, avec une date de pièce au 31 octobre. Dans quelle période est-elle comptabilisée ? (question ' || i || ')',
      'mode', 'single',
      'options', jsonb_build_array(
        jsonb_build_object('id', 'a', 'text', 'La période de la date de pièce', 'correct', true, 'notionId', v_notion),
        jsonb_build_object('id', 'b', 'text', 'La période de la date de saisie', 'correct', false, 'notionId', v_notions[1]),
        jsonb_build_object('id', 'c', 'text', 'La période de la date d''échéance', 'correct', false, 'notionId', v_notions[1])
      ),
      'explanation', 'La période comptable est celle de la date de pièce : le rattachement suit la pièce, pas la saisie.',
      'objective', 'Distinguer la date de pièce de la date de saisie',
      'sources', '[]'::jsonb
    );

    IF i = 1 THEN
      INSERT INTO public.brick_versions (id, brick_id, version, payload, fingerprint, origin, created_by)
      VALUES (v_version, v_brick, 1, v_payload, NULL, 'tutor', 'tutor');
    END IF;

    INSERT INTO public.answers (attempt_id, brick_version_id, position, response, max_score)
    VALUES (v_attempt, v_version, i, '{}'::jsonb, 10);

    v_items := v_items || jsonb_build_object(
      'brickId', v_brick,
      'brickVersionId', v_version,
      'points', 10,
      'notionId', v_notion,
      'notionLabel', (SELECT label FROM public.notions WHERE id = v_notion),
      'type', 'choice_question',
      'payload', v_payload
    );
  END LOOP;

  v_bricks := jsonb_build_array(v_brick);
  UPDATE public.activities SET items = v_items, status = 'ready' WHERE id = v_activity;
  UPDATE public.activities
  SET config = config || jsonb_build_object('brickIds', v_bricks, 'attemptId', v_attempt)
  WHERE id = v_activity;

  RAISE NOTICE 'tentative % prête (activité %)', v_attempt, v_activity;
END $$;

SELECT a.id AS attempt_id, act.id AS activity_id, a.status, jsonb_array_length(act.items) AS questions
FROM public.attempts a
JOIN public.activities act ON act.id = a.activity_id
WHERE act.config ->> 'sdd' = 'SPEC-3501';
