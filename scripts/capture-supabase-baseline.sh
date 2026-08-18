#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERRO: defina SUPABASE_DB_URL antes de capturar o baseline." >&2
  exit 2
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERRO: Supabase CLI não encontrada no PATH." >&2
  exit 3
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/supabase/baseline/generated"
TMP="$OUT/.tmp"
rm -rf "$TMP"
mkdir -p "$TMP"

supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$TMP/roles.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$TMP/schema.sql"

# Evita substituir um baseline válido por arquivos vazios/incompletos.
[[ -s "$TMP/roles.sql" ]] || { echo "ERRO: roles.sql vazio." >&2; exit 4; }
[[ -s "$TMP/schema.sql" ]] || { echo "ERRO: schema.sql vazio." >&2; exit 5; }

grep -q "public" "$TMP/schema.sql" || {
  echo "ERRO: schema.sql não contém referências ao schema public." >&2
  exit 6
}

(
  cd "$TMP"
  sha256sum roles.sql schema.sql > manifest.sha256
)

mkdir -p "$OUT"
mv "$TMP/roles.sql" "$OUT/roles.sql"
mv "$TMP/schema.sql" "$OUT/schema.sql"
mv "$TMP/manifest.sha256" "$OUT/manifest.sha256"
rmdir "$TMP"

echo "Baseline Supabase capturado em: $OUT"
