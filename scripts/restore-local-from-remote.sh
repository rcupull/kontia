#!/bin/sh

set -eu

DUMP_PATH="/tmp/kontia-remote.sql"
D1_STATE_PATH=".wrangler/state/v3/d1"
D1_OBJECT_PATH="$D1_STATE_PATH/miniflare-D1DatabaseObject"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "Error: sqlite3 no está instalado o no está disponible en PATH." >&2
  exit 1
fi

echo "Exportando kontia-db desde Cloudflare D1..."
rm -f "$DUMP_PATH"
wrangler d1 export kontia-db --remote --output "$DUMP_PATH"

echo "Recreando la base D1 local..."
rm -rf "$D1_STATE_PATH"
wrangler d1 execute kontia-db --local --command "SELECT 1" >/dev/null

LOCAL_DB_PATH=$(find "$D1_OBJECT_PATH" -maxdepth 1 -type f -name '*.sqlite' ! -name 'metadata.sqlite' | head -n 1)
if [ -z "$LOCAL_DB_PATH" ]; then
  echo "Error: Wrangler no creó el archivo SQLite local esperado." >&2
  exit 1
fi

echo "Importando directamente con SQLite..."
sqlite3 "$LOCAL_DB_PATH" < "$DUMP_PATH"

if ! sqlite3 "$LOCAL_DB_PATH" "SELECT 1 FROM businesses LIMIT 1;" >/dev/null; then
  echo "Error: la copia local no contiene la tabla businesses." >&2
  exit 1
fi

rm -f "$DUMP_PATH"
echo "Base de datos local restaurada correctamente desde la remota."
