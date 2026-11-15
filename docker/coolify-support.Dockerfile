# syntax=docker/dockerfile:1.7
# Images d'appoint de la pile Coolify (docker/compose.coolify.yml, docs/operations/coolify.md).
#
# Coolify ne monte pas les fichiers du dépôt Git dans les conteneurs d'une application Compose : un
# bind mount relatif y devient un dossier vide. Chaque fichier versionné que la pile auto-hébergée
# (docker/compose.selfhost.yml) monte est donc copié dans une image, une cible par service :
#   - db             : Postgres Supabase + mot de passe des rôles de connexion au premier démarrage ;
#   - kong           : passerelle de l'API Supabase avec sa configuration déclarative ;
#   - migrate        : applique supabase/migrations une seule fois par fichier ;
#   - auth-templates : sert les modèles d'e-mails de Supabase Auth (lien token_hash) sur le réseau
#                      interne, lus par GoTrue via GOTRUE_MAILER_TEMPLATES_* ;
#   - inngest        : Inngest auto-hébergé avec sa sonde de santé (l'image n'a ni curl ni wget).
# Les images tierces sont celles, épinglées, de la pile auto-hébergée. Le contexte est filtré par
# coolify-support.Dockerfile.dockerignore (liste blanche) : aucun secret, aucun code applicatif.

FROM public.ecr.aws/supabase/postgres:17.11.0.006 AS db
# Exécuté une seule fois, sur un volume vide, après l'initialisation Supabase de l'image.
COPY --chown=root:root --chmod=0444 docker/selfhost-init-roles.sql \
  /docker-entrypoint-initdb.d/init-scripts/99-learny-roles.sql

FROM public.ecr.aws/supabase/kong:2.8.1 AS kong
COPY --chown=root:root --chmod=0444 docker/kong.selfhost.yml /home/kong/kong.yml

FROM postgres:17.6-alpine3.22 AS migrate
ENV MIGRATIONS_DIR=/migrations
COPY --chown=root:root --chmod=0555 docker/apply-migrations.sh /apply-migrations.sh
COPY --chown=root:root supabase/migrations /migrations
USER postgres
ENTRYPOINT ["/bin/sh", "/apply-migrations.sh"]

FROM busybox:1.37.0 AS auth-templates
COPY --chown=root:root supabase/templates /www
USER 65534:65534
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/confirmation.html"]
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]

FROM inngest/inngest:v1.52.0 AS inngest
COPY --chown=root:root --chmod=0555 docker/inngest-healthcheck.pl /healthcheck.pl
