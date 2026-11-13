# SPEC-603 — critères d'acceptation

- ✅ CA-1 — Sur le seed `demo` et l'horloge figée, `/home` renvoie 4 créneaux, 300 min prévues, 180 min faites, 14 notions au quiz (18 dues, 4 reportées au 2026-11-12, plafond 15), 3 lignes « En cours » et 2 « Terminées » — preuve : `packages/services/test/integration/home.test.ts`, cas « valeurs du seed démo ».
- ✅ CA-2 — Les textes de la section 10 et la structure des cinq régions sont affichés, comparaison par régions ≤ 12 % — preuve : `apps/web/e2e/specs/p6/spec-603-home.spec.ts`, test `@SPEC-603 @visual`, captures `visual/`.
- ✅ CA-3 — Les actions mènent aux bonnes routes : Python → programme, SAP → module 3, Excel → quiz global, « Nouvelle formation » → `/formations/nouvelle`, cadrage → `/cadrage` — preuve : e2e « journée d'Alex » et `FormationsTable.test.tsx`.
- ✅ CA-4 — `slotState` et `moduleStatusPill` respectent les tables de EF-2 et EF-6 — preuve : `packages/services/src/home/derive.test.ts`, cas tabulés.
- ✅ CA-5 — Fuseau `America/New_York` : date et heures locales — preuve : `home.test.ts`, cas fuseau.
- ✅ CA-6 — Nouvel utilisateur : états vides de EF-3, EF-4, EF-8 sans erreur — preuve : e2e « accueil d'un nouvel utilisateur », capture `accueil-vide.png`.
- ✅ CA-7 — p95 < 300 ms sur 20 appels et isolation RLS — preuve : `home.test.ts`, cas p95 et « ne renvoie aucune donnée d'Alex ».
- ✅ CA-8 — Aucune violation axe serious/critical, onglets au clavier, `?onglet=terminees` — preuve : e2e axe sur les deux onglets et navigation clavier.
