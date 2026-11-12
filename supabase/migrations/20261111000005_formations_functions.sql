-- Fonction des contraintes de SPEC-103 (ET-3).
-- Migration personnalisée créée avant la migration générée : la contrainte
-- `formations_objectives_unique` du CHECK l'utilise. Ne jamais modifier après fusion :
-- ajouter une nouvelle migration.

-- Vrai quand le tableau ne contient aucun doublon (les objectifs sont un ensemble, BR-FOR-03).
-- Paramètre `text[]` pour rester utilisable par toutes les énumérations tableau.
create or replace function public.enum_array_is_set(text[]) returns boolean
  language sql immutable parallel safe strict
  set search_path = ''
  as $$ select cardinality($1) = (select count(distinct x) from unnest($1) as x) $$;
