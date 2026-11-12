-- Fonctions d'identité utilisées par les contraintes de SPEC-102 (ET-3).
-- Migration personnalisée créée avant la migration générée : les contraintes CHECK de
-- `study_preferences` et les lignes par défaut de `automation_settings` en dépendent.
-- Ne jamais modifier cette migration après fusion : ajouter une nouvelle migration.

-- Vrai quand le tableau ne contient aucun doublon (les jours d'étude sont un ensemble, BR-ACC-08).
create or replace function public.smallint_array_is_set(smallint[]) returns boolean
  language sql immutable parallel safe strict
  set search_path = ''
  as $$ select cardinality($1) = (select count(distinct x) from unnest($1) as x) $$;

-- Valeurs `params` par défaut des dix automatismes (EF-6, ADR-0114).
-- Paramètre `text` : l'énumération `automation_key` est créée par la migration suivante.
create or replace function public.default_automation_params(k text) returns jsonb
  language sql immutable parallel safe strict
  set search_path = ''
  as $$
    select case k
      when 'reprise' then
        '{"missedReplace":"consent","inactiveDays":2,"lightenAfterDays":5}'::jsonb
      when 'micro_seance' then
        '{"hour":20,"durationMin":5}'::jsonb
      when 'echauffement' then
        '{"questionCount":3,"scope":"yesterday_and_prerequisites"}'::jsonb
      when 'remediation' then
        '{"retryDelayHours":24,"mode":"advised"}'::jsonb
      when 'jeu_lacune' then
        '{"preference":"vary"}'::jsonb
      when 'questions_cartes' then
        '{"mode":"confirm"}'::jsonb
      when 'plafond_quiz' then
        '{"maxMinutes":15,"targetRetention":0.9}'::jsonb
      when 'sprint' then
        '{"daysBefore":3,"durationMin":30}'::jsonb
      when 'bilan' then
        '{"weekday":7,"hour":19,"channel":"app"}'::jsonb
      when 'pause' then
        '{"diagnosticOnReturn":true,"diagnosticMinutes":10}'::jsonb
      else null
    end
  $$;
