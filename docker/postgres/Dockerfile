# Postgres with the pgvector extension, fully pinned.
#
# The official image already trusts the signed PGDG apt repository for this
# codename, so the extension is installed from the same source as the server
# itself. Both the server patch and the extension build are pinned: a routine
# repository refresh must never change the vector version under a live
# database, and a rebuild of this file must produce the same bytes.
#
# `postgresql-18-pgvector` declares `postgresql-18 (>> 18.7)`, which is why the
# base moves from 18.6 to 18.7. 18.7 is the current PostgreSQL 18 patch; the
# 18.6 to 18.7 step is a patch bump inside major 18 and needs no pg_upgrade.
FROM postgres:18.7-trixie

# Hold the server packages so installing the extension can never pull a
# different server build in as a side effect of dependency resolution.
RUN set -eux; \
    apt-get update; \
    apt-mark hold postgresql-18 postgresql-client-18; \
    apt-get install -y --no-install-recommends \
        postgresql-18-pgvector=0.8.7-1.pgdg13+2; \
    rm -rf /var/lib/apt/lists/*; \
    postgres --version; \
    test -f /usr/share/postgresql/18/extension/vector.control; \
    test -f /usr/share/postgresql/18/extension/vector--0.8.7.sql
