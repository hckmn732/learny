# ADR-0222 — Ajustements d'implémentation de SPEC-002

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-002, ADR-0103

## Contexte

SPEC-002 fixe exactement les motifs de secrets et attend une seule trouvaille pour une clé Anthropic, or le motif openai-key (sk-(?:proj-)?[A-Za-z0-9_-]{32,}) reconnaît aussi sk-ant-api03-…. La démonstration doit lire core.hooksPath côté serveur alors que spec-002.tsx est décrit comme un composant client. CL-1 annonce une description de fusion de 73 caractères alors que « Application web : configuration de base, santé et pages de démonstration » en compte 72. Le type Commit de commitlint (conventional-commits-parser 7) expose type, scope et subject par une signature d'index.

## Décision

1. scanText ne rapporte qu'une trouvaille par portion de texte : quand plusieurs motifs se chevauchent sur une ligne, le premier de SECRET_PATTERNS l'emporte (anthropic-key avant openai-key) ; les expressions régulières restent celles de la spécification. 2. spec-002.tsx est un Server Component (lecture de git config core.hooksPath) qui rend les formulaires interactifs de components/sdd-demos/spec-002-forms.tsx ('use client'). 3. Le test de CL-1 vérifie la règle (description de fusion jusqu'à 100 caractères, refus au-delà, 72 pour les autres types) sans affirmer la longueur 73. 4. ParsedCommit = Readonly<Record<string, unknown>> pour rester compatible avec le type Commit de commitlint.

## Conséquences

Une clé détectée n'est comptée qu'une fois ; la démonstration affiche « 1 secret(s) détecté(s) » pour une clé Anthropic.
