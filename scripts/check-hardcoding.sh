#!/usr/bin/env bash
# Falla si el código del motor contiene valores propios de un país, mercado o agencia.
# Lo específico debe vivir en packages/markets, packages/destinations o instances/ (doc 11).
#
# Uso: ./scripts/check-hardcoding.sh
# Para añadir patrones: scripts/hardcoding-patterns.txt (una expresión regular extendida por línea).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATTERNS="$ROOT/scripts/hardcoding-patterns.txt"
SCAN_DIRS=(apps functions packages/shared)
# Salidas de build que no se escanean. No se usa --exclude-dir=lib porque
# excluiría cualquier carpeta `lib` (apps/landings/lib es código fuente).
BUILD_OUTPUTS=("$ROOT/functions/lib/")

# Solo código; la documentación puede usar ejemplos.
INCLUDES=(--include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.json')
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=generated --exclude=package.json --exclude='tsconfig*.json')

existing=()
for d in "${SCAN_DIRS[@]}"; do [[ -d "$ROOT/$d" ]] && existing+=("$ROOT/$d"); done
[[ ${#existing[@]} -eq 0 ]] && { echo "check-hardcoding: nada que revisar"; exit 0; }

regex="$(grep -v '^[[:space:]]*#' "$PATTERNS" | grep -v '^[[:space:]]*$' | paste -sd '|' -)"

matches="$(grep -rnIE "${INCLUDES[@]}" "${EXCLUDES[@]}" -e "$regex" "${existing[@]}" || true)"
for out in "${BUILD_OUTPUTS[@]}"; do
  matches="$(printf '%s\n' "$matches" | grep -vF "$out" || true)"
done
if [[ -n "$matches" ]]; then
  echo "check-hardcoding: valores de instancia encontrados en el motor:"
  echo "$matches" | sed "s#$ROOT/##"
  echo
  echo "Muévelos a packages/markets, packages/destinations o instances/<id> y léelos de la configuración resuelta."
  echo "Si es un falso positivo, añade al final de la línea el comentario: hardcoding-ok"
  if echo "$matches" | grep -vq 'hardcoding-ok'; then exit 1; fi
fi

echo "check-hardcoding: OK"
