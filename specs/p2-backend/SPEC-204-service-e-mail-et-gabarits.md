---
id: SPEC-204
title: Service e-mail et gabarits
phase: P2
priority: V1
depends_on: [SPEC-203, SPEC-009]
business_rules: [BR-NOT-08]
screens: []
adrs: [ADR-0054, ADR-0032, ADR-0010, ADR-0124]
visual: demo
---

# SPEC-204 — Service e-mail et gabarits

## 1. Objectif

Livrer le module `@learny/notifications/email` : envoi d'e-mails par trois transports (Resend en production, SMTP vers Mailpit en local, mémoire en test), huit gabarits React Email en français avec variantes « vous » / « tu », pied de page de gestion des préférences, en-têtes `List-Unsubscribe` pour les e-mails non transactionnels, désinscription en un clic, et l'e-mail de bienvenue déclenché par `user/signed-up`. Les autres gabarits sont appelés par SPEC-209 (rappels, programme du jour, bilan, échec IA) et SPEC-211 (export, suppression).

## 2. Contexte

- ADR-0054 (Resend, Mailpit, mémoire ; gabarits dans `packages/notifications/emails/`), ADR-0032 (transactionnels toujours envoyés ; lien « Gérer mes notifications » et `List-Unsubscribe` sur les autres), ADR-0010 (deux variantes de texte selon le ton).
- Ton et textes : panneau de notifications de chaque maquette (`design/maquettes/Main.dc.html`, section `#panneau-notifications`), carte « Bilan de la semaine » et « Votre journée » de `Main.dc.html`, étapes Rappels/Départ de `Inscription.dc.html`.
- E-mails d'authentification : gabarits Supabase de SPEC-202 (hors de ce module).
- Documents : `docs/product/business-rules.md` (NOT, ACC-10/11), ADR-0031, ADR-0044, ADR-0124.

## 3. Dépendances

- **SPEC-203** : `defineFunction`, catalogue d'événements (`user/signed-up`), `JOBS_MODE=inline` pour les tests e2e.
- **SPEC-009** : schéma des variables `@learny/config` ; ajouter si absentes : `EMAIL_MODE` (`resend` | `smtp` | `memory` ; défaut `smtp` en local, `memory` si `NODE_ENV=test`), `EMAIL_FROM` (défaut `Learny <bonjour@learny.app>`), `RESEND_API_KEY` (obligatoire si `EMAIL_MODE=resend`), `SMTP_HOST` (défaut `127.0.0.1`), `SMTP_PORT` (défaut `1025`), `NEXT_PUBLIC_APP_URL`, **nouvelle** `EMAIL_LINK_SECRET` (≥ 32 caractères, obligatoire en production ; valeur de développement fixe dans `.env.example`).
- Déjà présents : `profiles` (`first_name`, `tutor_tone`, `email`), `notification_settings` (`channel_email`), `handler()` (SPEC-201), Mailpit (SPEC-008).
- Bibliothèques : `react-email` ≥ 4, `@react-email/components` ≥ 0.1, `@react-email/render`, `resend` ≥ 4, `nodemailer` ≥ 6 (SMTP). Resend indisponible ou sans domaine vérifié en production → blocage externe consigné (SPEC-808), jamais simulé.

## 4. Règles métier couvertes

- **BR-NOT-08** : chaque gabarit est rendu dans la mise en page commune `EmailLayout` dont le pied contient toujours le lien « Gérer mes notifications » vers `${NEXT_PUBLIC_APP_URL}/parametres#notifications` (test sur les 8 gabarits × 2 tons). Les gabarits de catégorie `transactional` (export prêt, suppression programmée, suppression effectuée) sont envoyés quelles que soient les préférences (`channel_email` ignoré) et sans `List-Unsubscribe` ; les autres portent `List-Unsubscribe` et `List-Unsubscribe-Post` et ne partent que si `channel_email = true` (contrôle par l'appelant via `canSendMarketing` ou par SPEC-209).

## 5. Exigences fonctionnelles

- **EF-1** `sendEmail()` envoie un gabarit rendu (HTML + texte brut) à l'adresse du profil, dans le ton du profil (`tutor_tone`, défaut `vous`), avec l'expéditeur `EMAIL_FROM`.
- **EF-2** Gabarits, catégories et sujets (variante `vous` ; variante `tu` en italique quand elle diffère) :
| Clé | Catégorie | Sujet |
|---|---|---|
| `welcome` | `service` | « Bienvenue sur Learny » |
| `daily_digest` | `service` | « Votre programme du {jour long} » / *« Ton programme du {jour long} »* |
| `reminder` | `service` | `{title}` (titre de la notification, déjà au bon ton) |
| `weekly_review` | `service` | « Votre bilan de la semaine du {début} au {fin} » / *« Ton bilan … »* |
| `ai_task_failed` | `service` | « Le tuteur n'a pas pu terminer : {tâche} » |
| `export_ready` | `transactional` | « Votre export Learny est prêt » / *« Ton export Learny est prêt »* |
| `deletion_scheduled` | `transactional` | « Suppression de votre compte programmée le {date} » / *« … de ton compte … »* |
| `deletion_completed` | `transactional` | « Votre compte Learny a été supprimé » / *« Ton compte … »* |
- **EF-3** Textes des corps (variante `vous` ; la variante `tu` transpose pronoms et impératifs : « vous » → « tu/te/toi », « votre/vos » → « ton/ta/tes », impératifs à la 2e personne du singulier) :
  - `welcome` : titre « Bienvenue, {prénom ou rien} ! » ; « Votre compte est prêt. Le tuteur vous attend pour quelques réglages : votre profil, votre rythme et votre IA. Comptez deux minutes. » ; trois puces « Des cours construits à partir de vos propres ressources, sources citées », « Des révisions espacées pour ne pas oublier », « Gratuit avec votre propre clé d'IA » ; bouton « Continuer mes premiers pas » → `/premiers-pas/profil`.
  - `daily_digest` : « Bonjour {prénom}, » ; « Voici vos {n} activités du jour, toutes formations confondues : {heures prévues} prévues. » ; liste `HH:MM · {titre}` + ligne `{détail} · {formation}` ; bloc « Quiz global : {k} notions à revoir, environ {m} min. » si présent ; journée vide : « Aucune activité prévue aujourd'hui. Un quiz global de 5 minutes garde vos notions au chaud. » ; bloc facultatif « En attente dans l'application » : « {c} notification(s) n'ont pas été envoyée(s) hier pour respecter votre limite de {max} par jour : » + liste des titres + lien « Ouvrir les notifications » (`/accueil?notifications=ouvertes`) ; bouton « Ouvrir ma journée » → `/accueil`.
  - `reminder` : titre `{title}`, paragraphe `{body}`, ligne grise `{formationTitle}`, bouton `{ctaLabel}` (défaut « Ouvrir dans Learny ») → `{href}` absolu.
  - `weekly_review` : trois chiffres « {h} d'étude », « {r} % retenu à 1 mois », « {k} notions à risque » ; paragraphes « Réussi : {…} », « À risque d'oubli : {…}. Ils passent dans vos prochains quiz globaux. », « Cette semaine : {…} » ; question « Vos disponibilités changent-elles ? » ; boutons « Voir le bilan » → `/accueil` et « Mes disponibilités changent » → `/parametres#profil`.
  - `ai_task_failed` : « Le modèle {modèle} de votre clé a produit un contenu invalide deux fois de suite pour « {objet} ». La tâche est arrêtée, rien n'a été modifié. » ; « Choisissez un autre modèle de votre clé » + (si abonné) « ou utilisez l'IA fournie. » ; bouton « Choisir un modèle » → `/parametres#modeles`.
  - `export_ready` : « Votre archive ({taille}) est prête. Le lien de téléchargement est valable 7 jours, jusqu'au {date et heure locales}. » ; bouton « Télécharger mes données » → URL signée fournie ; « Ce lien est personnel : ne le transférez pas. »
  - `deletion_scheduled` : « Vous avez demandé la suppression de votre compte. Elle sera effective le {date} : formations, apports, cours, résultats et réglages seront alors effacés définitivement. » ; « D'ici là, vous pouvez l'annuler à tout moment : il suffit de vous reconnecter. » ; boutons « Annuler la suppression » → `/parametres#profil` et « Exporter mes données » → `/parametres#profil`.
  - `deletion_completed` : « Comme demandé le {date de demande}, votre compte et toutes vos données ont été supprimés définitivement aujourd'hui. Merci d'avoir appris avec Learny. »
- **EF-4** Pied commun : « Vous recevez cet e-mail parce que vous avez un compte Learny. » / *« Tu reçois … tu as … »*, lien « Gérer mes notifications » (BR-NOT-08) ; pour la catégorie `service` uniquement, lien « Se désabonner des e-mails » vers la page de désinscription.
- **EF-5** Désinscription en un clic (RFC 8058) : `POST /api/v1/email/unsubscribe?token=…` (corps `List-Unsubscribe=One-Click` ou vide) met `notification_settings.channel_email = false` et renvoie 200 ; `GET` sur la même URL renvoie une page HTML française « Ne plus recevoir les e-mails de rappel de Learny ? » avec un bouton « Confirmer » (formulaire POST) et le texte « Les e-mails liés à la sécurité de votre compte et à vos données continueront d'arriver. » ; après POST depuis la page : « C'est fait. Vous pouvez réactiver les e-mails dans Paramètres › Notifications. ». Jeton invalide → 400 page « Ce lien n'est plus valide. ».
- **EF-6** À `user/signed-up`, l'e-mail `welcome` est envoyé une fois (si `channel_email = true`), immédiatement, hors plafond et hors heures calmes (réponse directe à une action de l'utilisateur, ADR-0124).
- **EF-7** Page `/_dev/sdd/SPEC-204` : aperçu de chaque gabarit dans les deux tons et envoi vers le transport courant (section 10).

## 6. Exigences techniques

**ET-1 — API** (`packages/notifications/src/email/index.ts`, exporté sous `@learny/notifications/email`) :
```ts
export type EmailTemplateKey = 'welcome' | 'daily_digest' | 'reminder' | 'weekly_review'
  | 'ai_task_failed' | 'export_ready' | 'deletion_scheduled' | 'deletion_completed';
export type Tone = 'vous' | 'tu';
export interface EmailMessage { to: string; from: string; subject: string; html: string; text: string;
  headers: Record<string, string>; tags: { name: string; value: string }[] }
export interface EmailTransport { name: 'resend' | 'smtp' | 'memory';
  send(msg: EmailMessage, opts: { idempotencyKey: string }): Promise<{ messageId: string }> }
export function renderEmail<K extends EmailTemplateKey>(key: K, props: EmailProps<K>,
  o: { tone: Tone; userId: string }): Promise<Omit<EmailMessage, 'to' | 'from'>>;
export function sendEmail<K extends EmailTemplateKey>(sctx: SystemContext, a: {
  userId: string; template: K; props: EmailProps<K>; idempotencyKey: string;
  toOverride?: string;           // deletion_completed : adresse capturée avant suppression
  toneOverride?: Tone;
}): Promise<Result<{ messageId: string; category: 'service' | 'transactional' }>>;
export function canSendServiceEmail(sctx: SystemContext, userId: string): Promise<boolean>; // channel_email
export function getTransport(): EmailTransport;
```
`EMAIL_TEMPLATES` : `Record<K, { category, propsSchema: ZodSchema, subject(props, tone): string, component: React.FC }>`. `sendEmail` valide `props`, lit `email`, `first_name`, `tutor_tone` via `serviceDb` (opération autorisée : lecture de profil pour envoi), rend, ajoute les en-têtes, appelle le transport ; profil introuvable → `err(NOT_FOUND)` (sauf `toOverride`). `sendEmail` ne contrôle **pas** `channel_email` : l'appelant le fait (SPEC-209) ; `welcome` le contrôle dans sa fonction.

**ET-2 — Schémas de props** (`packages/notifications/emails/schemas.ts`) :
```ts
welcome:            z.object({ firstName: z.string().max(60).nullable() })
daily_digest:       z.object({ firstName: z.string().max(60).nullable(), dateLabel: z.string(), plannedLabel: z.string(),
                      activities: z.array(z.object({ time: z.string().regex(/^\d{2}:\d{2}$/), title: z.string(), detail: z.string(), formationTitle: z.string() })).max(20),
                      globalQuiz: z.object({ notions: z.number().int().min(1), minutes: z.number().int().min(1), formationTitle: z.string() }).nullable(),
                      held: z.object({ count: z.number().int().min(1), maxPerDay: z.union([z.literal(3), z.literal(5), z.literal(8)]), titles: z.array(z.string()).max(10) }).nullable() })
reminder:           z.object({ title: z.string().max(120), body: z.string().max(400), href: z.string().startsWith('/'), ctaLabel: z.string().max(40).optional(), formationTitle: z.string().nullable() })
weekly_review:      z.object({ periodStartLabel: z.string(), periodEndLabel: z.string(), studyLabel: z.string(), retentionPercent: z.number().int().min(0).max(100).nullable(),
                      atRiskCount: z.number().int().min(0), succeeded: z.string(), atRisk: z.string(), nextWeek: z.string() })
ai_task_failed:     z.object({ taskLabel: z.string(), modelLabel: z.string(), subject: z.string().max(120), managedAvailable: z.boolean() })
export_ready:       z.object({ downloadUrl: z.string().url(), sizeLabel: z.string(), expiresLabel: z.string() })
deletion_scheduled: z.object({ scheduledLabel: z.string() })
deletion_completed: z.object({ requestedLabel: z.string() })
```
Les libellés de date et de durée sont formatés par l'appelant avec `Intl.DateTimeFormat('fr-FR', { timeZone })` (ex. « mercredi 11 novembre », « 5 h ») ; les gabarits ne calculent aucune date.

**ET-3 — Mise en page** (`packages/notifications/emails/layout.tsx`) : largeur 600 px, fond `#F4F4F1`, carte blanche rayon 24 px bordure `#E7E6E1`, en-tête logo (carré `#C6F432` 32 px rayon 10 px + « Learny » en Space Grotesk avec repli `Arial, sans-serif`), texte `#111113` 15 px Inter avec repli, bouton principal fond `#111113` texte `#FFFFFF` rayon 12 px hauteur ≥ 44 px, liens `#3A3AA8`, textes secondaires `#62626B`. Préentête (texte d'aperçu) par gabarit. Langue `lang="fr"`. Aucune image distante, aucun pixel de suivi. Version texte générée par `render(…, { plainText: true })`.

**ET-4 — En-têtes** : toujours `X-Entity-Ref-ID: <idempotencyKey>` (évite le regroupement des fils) et étiquettes `{ template, category }`. Catégorie `service` : `List-Unsubscribe: <${APP_URL}/api/v1/email/unsubscribe?token=${t}>` et `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Jeton : `base64url(userId) + '.' + base64url(HMAC-SHA256(EMAIL_LINK_SECRET, 'unsubscribe:v1:' + userId))`, sans expiration ; vérification à temps constant (`timingSafeEqual`).

**ET-5 — Transports** (`packages/notifications/src/email/transports/`) :
- `resend.ts` : `resend.emails.send({ from, to, subject, html, text, headers, tags }, { idempotencyKey })` ; délai 10 s ; réponses 429/5xx/réseau → erreur réessayable (`EmailTransientError`) ; 4xx → `EmailRejectedError` (non réessayable).
- `smtp.ts` : `nodemailer` vers `SMTP_HOST:SMTP_PORT` sans TLS (local) ; Mailpit.
- `memory.ts` : tableau en mémoire (`outbox`), déduplication par `idempotencyKey` (un second envoi renvoie le même `messageId` sans ajout), `clearOutbox()`, `listOutbox()`. Utilisé par `packages/testing/src/mail.ts` en tests unitaires/intégration.
`EMAIL_MODE=resend` interdit sans `RESEND_API_KEY` (échec au démarrage) ; `EMAIL_MODE=memory` interdit en production.

**ET-6 — Fonction de bienvenue** (`packages/jobs/src/functions/email-welcome.ts`) : `trigger: user/signed-up`, `idempotency: 'event.data.userId'`, étapes `check-preference` (`canSendServiceEmail`) puis `send` (`sendEmail(…, { template: 'welcome', idempotencyKey: 'welcome:' + userId })`). `EmailTransientError` → reprise ; `EmailRejectedError` → `NonRetriableError`.

**ET-7 — Routes** :
| Méthode et chemin | Auth | Entrée | Sortie | Erreurs |
|---|---|---|---|---|
| POST `/api/v1/email/unsubscribe` | public, `rateLimit: 'auth'` | query `token` | 200 HTML (page de confirmation) ou `{ ok: true }` si `Accept: application/json` | 400 `UNSUBSCRIBE_TOKEN_INVALID` |
| GET `/api/v1/email/unsubscribe` | public | query `token` | 200 `text/html` (formulaire, aucun changement d'état) | 400 page d'erreur |
| GET `/api/v1/dev/sdd/email/preview` | user, `ENABLE_SDD_PAGES` | `template`, `tone` | 200 `text/html` (données d'exemple d'Alex Perrin) | 400 |
| POST `/api/v1/dev/sdd/email/send` | user, `ENABLE_SDD_PAGES`, idempotent | `{ template, tone }` | 201 `{ messageId, transport }` (destinataire : l'utilisateur connecté) | 400 |
| GET `/api/v1/dev/sdd/email/outbox` | user, `ENABLE_SDD_PAGES` | — | 200 `{ items: { to, subject, headers, template, at }[] }` (transport mémoire ; liste vide sinon) | — |
Code ajouté : `UNSUBSCRIBE_TOKEN_INVALID` (400, « Lien de désinscription invalide »). La route de désinscription est la seule écriture publique : elle n'accepte que le jeton signé, met à jour par `serviceDb()` la seule colonne `channel_email`, et ne révèle pas l'adresse.

**ET-8 — Données d'exemple** : `packages/notifications/emails/fixtures.ts` reprend les données des maquettes (Alex Perrin, mercredi 11 novembre : 4 activités 09:00 « Relecture du cours », 13:50 « Échauffement », 14:00 « Quiz de validation, tentative 2 », 17:00 « Quiz global », 5 h prévues ; quiz global 14 notions, 10 min ; bilan 2–8 nov. : 13 h, 86 %, 3 notions) ; elles alimentent l'aperçu, les tests d'instantané et la page de démonstration.

## 7. Comportements attendus et cas limites

- **CL-1 Rejeu de la fonction de bienvenue** (reprise Inngest après envoi réussi) → même `idempotencyKey`, Resend/mémoire dédupliquent ; un seul e-mail.
- **CL-2 Resend en 429 ou 503** → `EmailTransientError`, reprise par Inngest (3 reprises) ; 400 (adresse rejetée) → arrêt définitif journalisé sans l'adresse.
- **CL-3 Utilisateur ayant coupé l'e-mail** → `welcome` non envoyé ; un `export_ready` (transactionnel) l'est quand même.
- **CL-4 Prénom absent** (inscription récente) → « Bienvenue ! » et « Bonjour, » sans espace superflu.
- **CL-5 Jeton de désinscription altéré** (1 caractère) → 400 ; jeton d'un autre utilisateur ne peut pas être forgé sans le secret.
- **CL-6 GET de la désinscription par un scanneur de liens** → aucun changement d'état (seul POST désinscrit).
- **CL-7 Contenu injecté** (titre de formation `<script>alert(1)</script>`) → échappé par React ; aucun HTML brut accepté dans les props.
- **CL-8 Programme du jour avec 20 activités** → toutes listées ; au-delà le schéma refuse (SPEC-209 tronque à 20 et ajoute « et N autres dans l'agenda » dans `plannedLabel`).
- **CL-9 Tutoiement** : chaque gabarit `tu` ne contient ni « vous » ni « votre » ni « vos » (test lexical), sauf dans les noms propres des données.

## 8. Instructions d'implémentation

1. Ajouter les variables au schéma `@learny/config` et à `.env.example`. Commit `feat(SPEC-204): configuration des e-mails`.
2. Créer `packages/notifications` s'il n'existe pas (`@learny/notifications`, exports `./email`), avec `emails/` (layout, 8 gabarits, `schemas.ts`, `fixtures.ts`, `tone.ts` exposant `t(tone, { vous, tu })`).
3. Écrire `src/email/{render,send,unsubscribe-token,index}.ts` et les trois transports. Commit `feat(SPEC-204): transports et rendu des gabarits`.
4. Écrire la fonction `email-welcome` et l'enregistrer.
5. Écrire les routes `apps/web/app/api/v1/email/unsubscribe/route.ts` et les routes de démonstration ; ajouter les routes à `docs/architecture/api.md`. Commit `feat(SPEC-204): désinscription en un clic et démonstration`.
6. Écrire `packages/testing/src/mail.ts` (lecture mémoire et Mailpit `GET ${MAILPIT_URL}/api/v1/messages`) si absent ; page `/_dev/sdd/SPEC-204`.
7. Tests (section 12). Commit `test(SPEC-204): gabarits, transports et désinscription`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/notifications/{package.json,README.md}`, `packages/notifications/emails/{layout,welcome,daily-digest,reminder,weekly-review,ai-task-failed,export-ready,deletion-scheduled,deletion-completed}.tsx`, `packages/notifications/emails/{schemas,fixtures,tone}.ts`, `packages/notifications/src/email/{index,render,send,unsubscribe-token}.ts`, `packages/notifications/src/email/transports/{resend,smtp,memory}.ts`, `packages/jobs/src/functions/email-welcome.ts`, `apps/web/app/api/v1/email/unsubscribe/route.ts`, `apps/web/app/api/v1/dev/sdd/email/{preview,send,outbox}/route.ts`, `apps/web/components/sdd/Spec204Demo.tsx`.
- **Modifiés** : `packages/config` (variables), `.env.example`, `packages/core/src/errors.ts`, `packages/jobs/src/functions/index.ts`, `packages/testing/src/mail.ts`, `docs/architecture/api.md`.
- **Lus** : `profiles`, `notification_settings`, `defineFunction`.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-204` :
1. `h1` « SPEC-204 — Service e-mail et gabarits ».
2. Barre d'outils : sélecteur « Gabarit » (8 options, `data-testid="email-template"`), contrôle segmenté « Ton » (`Vous` / `Tu`, `aria-pressed`, `email-tone`), badge de catégorie (« Transactionnel » / « Service »), bouton « Envoyer » (`email-send`).
3. Aperçu : `iframe` `sandbox=""` `srcDoc` (`email-preview`, titre accessible « Aperçu de l'e-mail »), largeur 640 px ; sous l'aperçu, sujet et en-têtes (`email-headers`) dont `List-Unsubscribe` quand présent.
4. Carte « Boîte d'envoi » (`email-outbox`) : liste des messages envoyés (sujet, destinataire masqué `a***@…`, heure).
Contrôles visuels : jetons de la page (fond `#F4F4F1`, cartes, contrôle segmenté actif `#111113`) ; dans l'aperçu, styles calculés du bouton (fond `rgb(17, 17, 19)`, rayon 12 px), du lien de pied (`rgb(58, 58, 168)`) et du logo (`rgb(198, 244, 50)`) ; `toHaveScreenshot` de la page avec `daily_digest`/`vous` (ligne de base) et de l'aperçu `welcome`/`tu`.

## 11. Critères d'acceptation

- **CA-1** Les 8 gabarits × 2 tons se rendent sans erreur, en HTML et en texte, et contiennent le lien « Gérer mes notifications » vers `/parametres#notifications`.
- **CA-2** Les gabarits `service` portent `List-Unsubscribe` et `List-Unsubscribe-Post: List-Unsubscribe=One-Click` ; les 3 gabarits transactionnels ne les portent pas.
- **CA-3** Aucune variante `tu` ne contient « vous », « votre » ou « vos » ; les sujets `vous`/`tu` correspondent à EF-2.
- **CA-4** `POST /api/v1/email/unsubscribe` avec un jeton valide passe `channel_email` à `false` ; jeton altéré → 400 ; `GET` ne modifie rien.
- **CA-5** `user/signed-up` envoie exactement un e-mail `welcome` (rejeu inclus) et aucun si `channel_email = false`.
- **CA-6** En `EMAIL_MODE=smtp`, un envoi depuis la page de démonstration apparaît dans Mailpit avec le sujet attendu ; en `memory`, dans la boîte d'envoi de la page.
- **CA-7** Une erreur 503 du transport Resend (simulée par MSW) est réessayée, une erreur 422 ne l'est pas.

## 12. Plan de tests

- **Unitaires** : `packages/notifications/emails/templates.test.tsx` — `describe('[SPEC-204] gabarits')` : rendu des 16 combinaisons, présence du lien de préférences, instantanés texte (pas HTML), contrôle lexical `tu`, échappement (CL-7), prénom absent. `src/email/unsubscribe-token.test.ts` — `[SPEC-204] jeton de désinscription` : aller-retour, altération, temps constant. `src/email/send.test.ts` — `[SPEC-204] envoi` : en-têtes par catégorie, déduplication mémoire. `transports/resend.test.ts` — `[SPEC-204] transport Resend` (MSW) : 429/503 → transitoire, 422 → rejeté, en-tête d'idempotence transmis.
- **Intégration** : `packages/notifications/test/integration/email.test.ts` — `describe('[SPEC-204] e-mails')` : `sendEmail` lit le profil (ton `tu` d'un utilisateur de fabrique) ; fonction `email-welcome` exécutée deux fois par `InngestTestEngine` → un message ; préférence coupée → zéro ; route de désinscription (POST/GET/jeton invalide) via `next-test-api-route-handler` ; envoi SMTP réel vers Mailpit si `MAILPIT_URL` répond (sinon test marqué `skip` avec raison journalisée, la CI utilisant `memory`).
- **End-to-end** (`apps/web/e2e/specs/p2/spec-204-email.spec.ts`, `EMAIL_MODE=memory`, vidéo) : `test('aperçu et envoi des gabarits @SPEC-204', …)` : parcourir les 8 gabarits en `vous` puis `welcome` en `tu`, vérifier le sujet affiché, envoyer `daily_digest`, voir le message dans la boîte d'envoi ; ouvrir l'URL de désinscription extraite des en-têtes, confirmer, voir « C'est fait. ».
- **Visuel** : `test('page de démonstration SPEC-204 @SPEC-204 @visual', …)` : `expectTokens` (page et aperçu), structure, `toHaveScreenshot`.
- **Non-régression** : `@SPEC-203`, `@SPEC-202`, `[SPEC-009]` (schéma des variables).
- **Traçabilité** :
| Critère | Tests |
|---|---|
| CA-1 | unit gabarits ; e2e `@SPEC-204` |
| CA-2 | unit envoi ; e2e (en-têtes affichés) |
| CA-3 | unit gabarits (lexical, sujets) |
| CA-4 | int désinscription ; e2e |
| CA-5 | int fonction de bienvenue |
| CA-6 | int SMTP ; e2e boîte d'envoi |
| CA-7 | unit transport Resend |

## 13. Preuves attendues

Vidéo e2e ; captures de l'aperçu de chaque gabarit en `vous` (`screenshots/email-<clé>.png`) et de `welcome` en `tu` ; ligne de base visuelle ; rapports.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; en plus : `pnpm email:dev` (serveur d'aperçu React Email sur `packages/notifications/emails`) démarre ; aucun secret dans les instantanés ; journal des envois sans adresse e-mail (seulement `userId`, `template`, `messageId`).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0054, ADR-0032, ADR-0010, ADR-0031 (les transactionnels ne comptent pas dans le plafond), ADR-0044.
- **Décision créée** : ADR-0124 « Catégories d'e-mails et désinscription en un clic » — catégories `transactional`/`service`, lien de préférences sur tous les e-mails (BR-NOT-08), `List-Unsubscribe` RFC 8058 sur `service` seulement, jeton HMAC `EMAIL_LINK_SECRET` sans expiration, désinscription = `channel_email = false`, bienvenue immédiate hors plafond et heures calmes mais soumise à `channel_email`.
- Hypothèse : le domaine d'envoi est vérifié chez Resend avant la production (checklist SPEC-808) ; les e-mails d'authentification restent servis par Supabase (SPEC-202).
