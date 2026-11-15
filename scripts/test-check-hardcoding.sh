#!/usr/bin/env bash
# Prueba de humo para scripts/check-hardcoding.sh: construye un mini repo
# temporal con casos positivos y negativos, y además corre el script real
# sobre este repositorio.
#
# Uso: ./scripts/test-check-hardcoding.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$TMP_DIR/scripts" "$TMP_DIR/functions/src"
cp "$ROOT/scripts/check-hardcoding.sh" "$TMP_DIR/scripts/check-hardcoding.sh"
cp "$ROOT/scripts/hardcoding-patterns.txt" "$TMP_DIR/scripts/hardcoding-patterns.txt"
chmod +x "$TMP_DIR/scripts/check-hardcoding.sh"

# Caso 1: moneda hardcodeada -> debe fallar.
echo "export const c = 'EUR';" > "$TMP_DIR/functions/src/bad.ts"
if ( cd "$TMP_DIR" && ./scripts/check-hardcoding.sh > /dev/null 2>&1 ); then
  echo "test-check-hardcoding: [caso-1-moneda] debería haber fallado y no falló"
  exit 1
fi
echo "test-check-hardcoding: [caso-1-moneda] ok (detectado)"
rm -f "$TMP_DIR/functions/src/bad.ts"

# Caso 2: prefijo telefónico hardcodeado -> debe fallar.
echo "export const p = '+34600';" > "$TMP_DIR/functions/src/bad.ts"
if ( cd "$TMP_DIR" && ./scripts/check-hardcoding.sh > /dev/null 2>&1 ); then
  echo "test-check-hardcoding: [caso-2-prefijo] debería haber fallado y no falló"
  exit 1
fi
echo "test-check-hardcoding: [caso-2-prefijo] ok (detectado)"
rm -f "$TMP_DIR/functions/src/bad.ts"

# Caso 3: código limpio -> debe pasar.
echo "export const ok = 'market-config';" > "$TMP_DIR/functions/src/clean.ts"
if ( cd "$TMP_DIR" && ./scripts/check-hardcoding.sh > /dev/null 2>&1 ); then
  echo "test-check-hardcoding: [caso-3-limpio] ok"
else
  echo "test-check-hardcoding: [caso-3-limpio] debería haber pasado y falló"
  exit 1
fi
rm -f "$TMP_DIR/functions/src/clean.ts"

# Caso 4: el script real sobre el repositorio completo -> debe pasar.
if ( cd "$ROOT" && ./scripts/check-hardcoding.sh > /dev/null 2>&1 ); then
  echo "test-check-hardcoding: [caso-4-repo] ok"
else
  echo "test-check-hardcoding: [caso-4-repo] el repositorio no pasa check-hardcoding.sh"
  exit 1
fi

echo "test-check-hardcoding: todos los casos pasaron"
