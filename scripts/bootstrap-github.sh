#!/usr/bin/env bash
# Crea etiquetas, hitos e issues del roadmap en el repositorio actual de GitHub.
# Es idempotente: se puede ejecutar varias veces sin duplicar nada.
#
# Requisitos: gh autenticado (gh auth login) y ejecutar desde la raíz del repo.
# Uso:        ./scripts/bootstrap-github.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISSUES_FILE="$SCRIPT_DIR/roadmap-issues.txt"

run() {
  if $DRY_RUN; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

if ! $DRY_RUN; then
  gh auth status >/dev/null 2>&1 || { echo "gh no está autenticado. Ejecuta: gh auth login"; exit 1; }
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  echo "Repositorio: $REPO"
fi

# ---------- Etiquetas ----------
echo "==> Etiquetas"
LABELS=(
  "type:feature|1D76DB|Nueva funcionalidad"
  "type:bug|D73A4A|Error"
  "type:chore|C5DEF5|Mantenimiento o configuración"
  "type:docs|0075CA|Documentación"
  "type:spec|5319E7|Especificación previa a implementar"
  "area:landings|FBCA04|Landings Next.js"
  "area:functions|F9D0C4|Cloud Functions"
  "area:agents|BFD4F2|Agentes de IA"
  "area:mcp|D4C5F9|Servidor MCP del catálogo"
  "area:data|C2E0C6|Datos, BigQuery, medición"
  "area:infra|EDEDED|Infraestructura y cuentas"
  "area:content|FEF2C0|Contenido y redes"
  "good-first-issue|7057FF|Buena para empezar"
  "blocked:agency|B60205|Depende de material de la agencia"
  "priority:high|E99695|Prioridad alta"
  "scope:engine|0E8A16|Motor: sirve a todas las instancias"
  "instance:ec-es|006B75|Instancia Ecuador → España"
)
for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color desc <<<"$entry"
  run gh label create "$name" --color "$color" --description "$desc" --force
done

# ---------- Hitos ----------
echo "==> Hitos"
EXISTING_MILESTONES=""
if ! $DRY_RUN; then
  EXISTING_MILESTONES="$(gh api "repos/$REPO/milestones?state=all&per_page=100" --jq '.[].title')"
fi

grep -v '^[[:space:]]*#' "$ISSUES_FILE" | grep -v '^[[:space:]]*$' | cut -d'|' -f1 | awk '!seen[$0]++' |
while IFS= read -r milestone; do
  if grep -Fxq "$milestone" <<<"$EXISTING_MILESTONES"; then
    echo "   = $milestone (ya existe)"
  else
    run gh api "repos/${REPO:-OWNER/REPO}/milestones" -f title="$milestone" --silent
    echo "   + $milestone"
  fi
done

# ---------- Issues ----------
echo "==> Issues"
EXISTING_ISSUES=""
if ! $DRY_RUN; then
  EXISTING_ISSUES="$(gh issue list --state all --limit 1000 --json title --jq '.[].title')"
fi

created=0; skipped=0
while IFS='|' read -r milestone labels title body; do
  [[ -z "${milestone// }" || "$milestone" =~ ^[[:space:]]*# ]] && continue
  if grep -Fxq "$title" <<<"$EXISTING_ISSUES"; then
    echo "   = $title"
    skipped=$((skipped + 1))
    continue
  fi
  body_text="$(printf '%b' "$body")"
  body_text+=$'\n\n_Generada desde scripts/roadmap-issues.txt (docs/10-roadmap.md)._'
  run gh issue create --title "$title" --body "$body_text" --label "$labels" --milestone "$milestone"
  echo "   + $title"
  created=$((created + 1))
done <"$ISSUES_FILE"

echo "Listo: $created creadas, $skipped ya existían."
echo "Siguiente paso: crea un GitHub Project (tablero) y añade las issues con: gh project item-add"
