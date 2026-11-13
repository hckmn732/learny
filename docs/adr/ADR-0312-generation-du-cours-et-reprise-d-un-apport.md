# ADR-0312 — Génération du cours et reprise d’un apport

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-607

## Contexte

SPEC-607 doit décider quand chapter/contributions-completed est émis, comment une suggestion V1 est marquée et comment une reprise réémet resource/uploaded sans dupliquer l’effet.

## Décision

L’événement de génération n’est émis qu’à la transition vers tous les chapitres terminés, ou sur demande explicite (force=true, chapterId=null). Son identifiant est déterministe par version (chapitres terminés + nombre d’apports). Réessayer ne s’applique qu’à un apport failed et émet un resource/uploaded suffixé par le numéro de tentative. Le guide d’examen V1 est un marquage du titre d’un PDF ou d’une page web, les fichiers audio/vidéo restent absents de l’interface.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
