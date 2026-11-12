# ADR-0271 — Contrats et intégration provisoires de la coquille

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-304, SPEC-305, SPEC-603, SPEC-606, SPEC-618, SPEC-723, ADR-0075, ADR-0162

## Contexte

SPEC-304 doit livrer le menu latéral alors que l'accueil (SPEC-603), le programme (SPEC-606), le sélecteur complet de formation (SPEC-618) et l'API de série (SPEC-723) ne sont pas encore livrés. Les colonnes formations.monogram et accent_color d'ADR-0162 dépendent explicitement de SPEC-603/604. Il faut donc fixer l'interface entre la coquille et ces spécifications futures sans élargir le périmètre produit.

## Décision

Le menu lit un DTO SidebarDto par GET /api/v1/me/sidebar et le met à jour par PATCH (masquage et formation courante), les deux sous le client RLS de l'utilisateur. La série est provisoire : profiles.streak_days et les 14 derniers jours de daily_activity, avec la forme { days, regularity } reprise par SPEC-723. La formation courante rendue est toujours active : une valeur current_formation_id pointant vers une formation en pause est conservée selon ADR-0075 mais la coquille se replie sur la dernière formation active ; les formations en pause restent proposées par Changer de formation. Le sigle suit le repli d'ADR-0162 (deux premiers caractères alphanumériques) et l'accent indigo par défaut jusqu'à la migration de SPEC-603, qui remplacera ces valeurs sans changer le DTO. Le masquage est écrit dans profiles.sidebar_collapsed et recopié dans localStorage pour le premier rendu ; la surimpression mobile ne modifie pas cette préférence. La coquille est montée sur /accueil et /formations/[fid]/programme avec un contenu d'attente explicite, SPEC-603 et SPEC-606 remplaçant ces contenus ; le bouton d'en-tête de SPEC-305 n'est pas anticipé, seul le déclencheur Afficher le menu est livré. Les liens de navigation sans route encore livrée utilisent prefetch=false pour éviter des préchargements 404.

## Conséquences

SPEC-305/306/307 réutilisent AppShell et le DTO sans redéfinir le menu. SPEC-603 doit remplacer le repli du sigle et de l'accent par les colonnes monogram/accent_color et son contenu d'accueil. SPEC-618 conserve la formation courante en profil et peut remplacer le sélecteur minimal. SPEC-723 remplace le bloc série provisoire en conservant la forme du DTO. Les preuves de non-régression visuelle de la coquille sont les captures desktop 1440×900 et mobile 390×844.
