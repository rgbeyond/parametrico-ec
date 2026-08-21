#!/usr/bin/env bash
# Aplica el esquema de Supabase sobre un PostgreSQL desechable y corre
# las pruebas de supabase/pruebas/. Sirve para no descubrir un error de
# SQL pegandolo en el editor de Supabase.
#
# Lo que NO cubre: las politicas RLS con usuarios reales, porque
# auth.uid() y los roles de Supabase no existen fuera de Supabase. Aqui
# solo se sustituyen para que el esquema aplique.
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin | head -1)
DATA=${PGDATA_TMP:-/var/tmp/pgvalida}
PUERTO=${PGPUERTO:-55432}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)

rm -rf "$DATA"; mkdir -p "$DATA"; chown postgres "$DATA"; chmod 700 "$DATA"
su postgres -c "$BIN/initdb -D $DATA -U postgres --auth=trust" >/dev/null
su postgres -c "$BIN/pg_ctl -D $DATA -o '-k /tmp -p $PUERTO' -l $DATA/log start" >/dev/null
trap 'su postgres -c "$BIN/pg_ctl -D $DATA stop" >/dev/null 2>&1 || true' EXIT
sleep 2

P="psql -h /tmp -p $PUERTO -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database valida" >/dev/null
$P -d valida -c "create role authenticated; create role anon; create role service_role;" >/dev/null

# Sustitutos de lo que provee Supabase.
$P -d valida <<'SQL' >/dev/null
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key,
  email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
SQL

for f in "$RAIZ"/supabase/[0-9]*.sql; do
  echo "aplicando $(basename "$f")"
  $P -d valida -f "$f" >/dev/null
done
for f in "$RAIZ"/supabase/pruebas/*.sql; do
  echo "probando $(basename "$f")"
  $P -d valida -f "$f"
done
echo "SQL en verde"
