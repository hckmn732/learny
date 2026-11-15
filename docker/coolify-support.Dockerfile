# syntax=docker/dockerfile:1.7
# Images d'appoint de la production Coolify (docker/compose.coolify.yml, docs/operations/coolify.md).
#
# Coolify ne monte pas les fichiers du dépôt Git dans les conteneurs d'une application Compose : un
# bind mount relatif y devient un dossier vide. Les fichiers versionnés dont la production a besoin
# sont donc copiés dans de petites images, une cible par usage :
#   - migrate        : applique supabase/migrations sur le Postgres du Supabase existant ;
#   - auth-templates : sert les modèles d'e-mails de Supabase Auth (lien token_hash) sur le réseau
#                      interne, lus par GoTrue via MAILER_TEMPLATES_* ;
#   - inngest        : Inngest auto-hébergé avec sa sonde de santé (l'image n'a ni curl ni wget).
# Le contexte est filtré par coolify-support.Dockerfile.dockerignore (liste blanche) : aucun secret,
# aucun code applicatif.

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
