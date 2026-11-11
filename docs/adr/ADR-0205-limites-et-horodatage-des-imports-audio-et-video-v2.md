# ADR-0205 — Limites et horodatage des imports audio et video V2

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-901, SPEC-902

## Contexte

ADR-0008 reserve les fichiers audio et video a V2. Le quota utilisateur global de 2 Go existe, mais les limites par fichier, formats et ancrage des citations de transcription ne sont pas precises.

## Décision

Un fichier audio accepte MP3, M4A, WAV ou WebM, au plus 200 Mo et 2 heures. Un fichier video accepte MP4, WebM ou MOV, au plus 500 Mo et 2 heures; seul son flux audio est transmis a la transcription. Ces bornes s'ajoutent au quota utilisateur de 2 Go. Les transcriptions produisent des segments non vides avec startSec/endSec en secondes, startSec < endSec, ordonnes, conserves comme resource_chunks; une citation pointe vers le segment et ouvre la lecture a startSec. La duree et le MIME reel sont controles cote serveur avant le job. Le fournisseur de transcription est Deepgram via DEEPGRAM_API_KEY et un adaptateur mock deterministe en test; si la cle manque en live, l'apport reste failed avec raison lisible et bouton Reessayer, sans fausse transcription.

## Conséquences

SPEC-901 et SPEC-902 partagent un contrat de transcription horodatee et des tests de quota, format, reprise et isolation des fichiers.
