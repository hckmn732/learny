# 01 — Synthèse exécutive

## Conclusion

Learny a déjà une API Hono séparée et le dépôt a supprimé les imports directs de paquets serveur depuis le web. Le problème n’est donc plus « sortir le backend de Next.js ». Il reste à décider si les bénéfices du changement de langage justifient de réécrire un backend métier étendu, puis à préserver ses garanties de données, d’apprentissage, de sécurité et de reprise.

Recommandation provisoire : un monolithe modulaire Python, FastAPI, SQLAlchemy 2 + Alembic + Psycopg 3, REST/OpenAPI 3.1, interfaces de fournisseurs IA, et workers séparés qui exécutent les mêmes cas d’usage. Garder PostgreSQL/Supabase et pgvector au début réduit le risque sur les données. Le SDK Inngest Python existe mais ne couvre pas tout le SDK TypeScript; Temporal est une option si la durabilité de workflows longs justifie son coût opérationnel. Ces décisions doivent être confirmées par ADR et prototypes. Aucun benchmark Python n’a été exécuté ici.

## État observé

- Checkout : main, commit 6881478a.
- Monorepo pnpm/Turbo TypeScript : apps/web Next.js et apps/api Hono/Node 24; aucun pyproject.toml.
- 219 routes selon tools/migration/report.mjs --check; contrats et OpenAPI séparés.
- Mesure du contrôle : 0 import serveur direct depuis apps/web. Le proxy Next, le rafraîchissement de session, les gardes de routes et les chargeurs SSR continuent toutefois de participer au transport et à l’authentification.
- Services, persistance, ingestion, tutorat, jobs et LLM restent en TypeScript. Les jobs invoquent les services directement, sans HTTP interne.
- PostgreSQL/Supabase fournit RLS, JWT claims, contraintes/triggers/fonctions SQL, Storage privé, pgvector et outbox transactionnelle.
- progress/state.json marque SPEC-1001..1004 done, SPEC-1101..1302 et CP-10..13 pending, alors que main comprend déjà plusieurs composants décrits par ces specs. Le suivi SDD et le code ne sont pas alignés; aucune validation SDD n’est présumée.

## Forces à préserver

1. Contrats API centraux, validation d’entrée/sortie et client typé.
2. Use cases appelables sans transport HTTP.
3. Isolation de données prouvée par les tests RLS.
4. Moteur d’apprentissage pur et déterministe.
5. Outbox transactionnelle et événements avec reprise.
6. Frontière IA, clés BYOK chiffrées, sorties structurées et mode mock.
7. Règles produit, tests, preuves et historique SDD.

## Recommandations

- Migrer par tranches verticales et comparer la sortie métier; ne pas traduire tout le monorepo en une fois.
- Préserver invariants produit (autorisations, quotas, paiements, idempotence, FSRS, validation); « AI-native » ne les rend pas probabilistes.
- Garder les use cases indépendants de Request, ORM, SDK IA et queue.
- Conserver temporairement schéma, Supabase Auth/Storage et Postgres; remplacer seulement sur preuve d’un blocage.
- Préparer une bascule réversible où une seule version écrit chaque donnée.
- Traiter 100k–500k actifs comme une cible non validée. Mesurer simultanéité, requêtes, SSE, IA, pool DB, coûts et reprises.

## Priorités

1. Résoudre la divergence entre la piste migration TypeScript et le nouveau projet Python.
2. Inventorier les 219 contrats, accès, erreurs et effets de bord.
3. Produire le graphe de dépendances réel des services, jobs et DB.
4. Prototyper un parcours RLS/transaction et un tutorat SSE avec outbox.
5. Comparer Hono et Python sous la même charge, configuration DB et mêmes dépendances externes.
6. Enregistrer les décisions majeures en ADR.

## Limites

Analyse de code et diagnostics non mutants; aucun test, benchmark, migration DB ou déploiement lancé. Les liens de fichiers du dossier sont les preuves primaires; les sources officielles en 05 comparent les outils sans garantir leurs performances.

- OpenAPI JSON contient 217 opérations, tandis que le rapport de migration compte 219 routes: deux entrées restent à réconcilier avant la migration du contrat.
