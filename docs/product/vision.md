# Vision produit — Learny

> Document de référence. Source : `docs/legacy/specification-v0/` (spécification validée avec le porteur du projet), maquettes `design/maquettes/`, registre `docs/adr/`. En cas de conflit, l'ordre de priorité est : ADR > `docs/product/business-rules.md` > ce document > legacy.

## 1. Le produit en une phrase

Learny est une application web qui permet à une personne de se former intensivement à **n'importe quel domaine** et d'en **retenir durablement** l'essentiel : un tuteur IA conçoit le parcours, transforme les ressources de l'apprenant en cours structurés et sourcés, l'entraîne, l'évalue, détecte ses lacunes et le fait réviser au bon moment.

## 2. Problème adressé : quatre freins

| Frein | Réponse de Learny | Fonctionnalités |
|---|---|---|
| Informations dispersées | Rassembler les ressources par chapitre et les fondre en un cours unique, progressif et sourcé | Cadrage, programme, apports, cours |
| Mémorisation fragile | Rappel actif, répétition espacée (FSRS), entrelacement, jeux de mémorisation | Quiz global, jeux, fiches « À retenir », échauffement |
| Manque de pratique | Exercices, examens blancs (V1) ; mises en situation, projet fil rouge (V2) corrigés par le tuteur | Exercice pratique, examen blanc |
| Irrégularité | Programme planifié dans un agenda, progression visible, relances et automatismes | Agenda, notifications, automatismes, série |

## 3. Utilisateurs

- **Cible V1** : particuliers (B2C) qui se forment seuls ou à quelques-uns. Les entreprises (B2B) sont **hors périmètre** (ADR-0005).
- **Persona de référence** : Alex Perrin, en reconversion vers le conseil SAP, se forme à « SAP S/4HANA Finance » du 2 novembre au 11 décembre 2026, 5 h par jour, avec un guide PDF, des notes vocales et des tutoriels vidéo. Il suit en parallèle « Gestion de projet agile » (en groupe) et a démarré « Python pour l'analyse de données ». Ces données sont celles des maquettes et du jeu de démonstration (SPEC-115).
- **Objectifs d'une formation** (combinables) : être opérationnel, réussir un examen ou une certification, dialoguer avec des experts, livrer un projet. Le type d'objectif oriente les activités (examen → examens blancs ; projet → projet fil rouge (V2) ; opérationnel/dialogue → exercices et mises en situation (V2)).

## 4. Principe directeur

Le tuteur IA porte environ 80 % de l'intelligence fonctionnelle, mais **le modèle propose, le code valide et exécute** :
- le tuteur n'écrit jamais directement dans les données ; il demande des **actions** d'un registre fermé, validées par schéma (ADR-0021) ;
- le **moteur d'apprentissage** (FSRS, maîtrise, lacunes, tirages, planificateur, série) est du TypeScript pur, déterministe, **sans aucun appel IA** (ADR-0020) ;
- tout ce que le code sait corriger (QCM, jeux, dates, scores, déblocages) ne fait **aucun appel IA**.

## 5. Parcours de l'apprenant (V1)

1. **Inscription** (lien magique ou mot de passe) puis **premiers pas** : profil, ton du tuteur, langue des cours, rythme, choix de l'IA (propre clé gratuite ou IA fournie payante), rappels.
2. **Nouvelle formation** : saisie du sujet, cadrage par chat (≤ 5 questions choisies par le tuteur).
3. **Programme** : proposé par le tuteur (analyse + recherche web) ou importé ; ajusté puis **validé** ; planifié dans l'agenda.
4. Pour chaque **module** : l'apprenant dépose ses **apports** par chapitre (notes, PDF, pages web, sous-titres YouTube, images) ; le tuteur génère le **cours** sourcé ; l'apprenant le lit, pose ses questions au tuteur dans une **discussion contextuelle**, résume chaque chapitre ; il passe le **quiz de validation** (seuil 80 % par défaut) autant de fois que nécessaire ; sous le seuil : **lacunes** qualifiées, **remédiation**, nouvelle tentative différée ; au-dessus : module validé, module suivant débloqué.
5. En continu : **quiz global** quotidien (répétition espacée par notion, jeux de mémorisation), **exercices pratiques**, **examens blancs**, **agenda**, **notifications**, **dix automatismes**, **série** et jalons, **carte des notions**, page **Mes lacunes**.
6. **Fin de formation** : bilan final ; choix d'un entretien de mémoire léger ou de l'arrêt des révisions.

## 6. Périmètre

### V1 (release `v1.0.0`)
Tout ce qui est listé dans `docs/product/business-rules.md` avec la priorité V1, notamment : comptes, onboarding, cadrage, programme (proposé/importé), apports (texte, PDF, web, YouTube, images), cours sourcé, discussion tuteur, quiz de validation, lacunes, remédiation, exercice pratique, examen blanc, quiz global et 5 jeux, carte des notions, agenda, notifications (in-app, e-mail, push), 10 automatismes, série et jalons, formations à plusieurs, limite de 3 formations actives, bilan final, modèles d'IA configurables (BYOK) et IA fournie payante (Stripe) avec plafond quotidien, export et suppression du compte, PWA hors ligne pour les révisions, RGPD.

### V2 (release `v2.0.0`, phase P9)
Import audio et vidéo avec transcription, détection des liens entre ressources et entre modules, « Explique à un débutant », mises en situation, projet fil rouge, détection fine de la baisse d'engagement.

### Hors périmètre (ADR-0005)
Offre entreprise (comptes gérés, administration, facturation B2B), applications mobiles natives, interface dans une autre langue que le français, classements entre apprenants, marketplace de formations.

## 7. Exigences transverses

- **Traçabilité** : chaque passage d'un cours renvoie aux extraits des ressources dont il provient ; ce qui vient des connaissances du tuteur est signalé « Complété par le tuteur · à confirmer dans vos sources ».
- **Contrôle par l'apprenant** : il peut corriger, compléter, rejeter ou signaler tout contenu généré ; une modification crée une nouvelle version.
- **Formats garantis** : toute brique non conforme à son schéma est refusée.
- **Vie privée** : les apports, cours, notes et lacunes restent privés, y compris dans une formation à plusieurs. Données hébergées en UE. RGPD.
- **Coût de l'IA maîtrisé** : modèle adapté à chaque tâche, cache, traitements groupés, génération unique puis réutilisation, plafond quotidien.
- **Accessibilité** : WCAG 2.2 niveau AA.
- **Qualité visuelle** : conformité aux maquettes `design/maquettes/` (ADR-0034).

## 8. Indicateurs de succès produit

- Indicateur principal de l'apprenant : **taux de rétention** à 1 mois et 2 mois (part des notions réussies parmi celles revues 30 et 60 jours après la fin de leur module).
- Indicateurs secondaires : série de jours, modules validés, coût IA par formation (suivi dans `ai_calls`).
