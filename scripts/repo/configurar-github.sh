#!/usr/bin/env bash
#
# configurar-github.sh — la configuración del repositorio que no se puede versionar.
#
# Aplica (idempotente) lo que el gate de datos necesita de la plataforma y que vive en la
# configuración de GitHub, no en el árbol (ver docs/mantenimiento.md, «Configuración de la
# plataforma»):
#
#   1. Etiquetas: datos-menor, datos-mayor, necesita-humano, esperando, ayuda-necesaria,
#      dato-incorrecto.
#   2. Ruleset «main» (scripts/repo/ruleset-main.json): PR obligatorio con 0 aprobaciones y
#      revisión de code owners, check requerido `validar-datos`, sin force-push ni borrado,
#      bypass siempre para el rol administrador.
#   3. Permisos por defecto del GITHUB_TOKEN en solo lectura.
#   4. Pages con origen «GitHub Actions».
#
# Lo corre el administrador del repositorio, con `gh` autenticado como tal:
#
#   scripts/repo/configurar-github.sh --dry-run    # muestra las llamadas, no ejecuta nada
#   scripts/repo/configurar-github.sh              # aplica
#
# Un ruleset activo cambia quién puede pushear a `main` (todos menos el administrador
# necesitan PR): por eso no lo corre ningún workflow ni ninguna automatización, solo una
# persona que sabe lo que hace.
set -euo pipefail

REPO="${REPO:-SebasCaules/Cuatris}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULESET="$AQUI/ruleset-main.json"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
correr() { # SILENCIO=1 correr … descarta la salida (las respuestas JSON de la API)
  if [ "$DRY_RUN" = 1 ]; then
    printf '   (dry-run) %q' "$1"; shift; printf ' %q' "$@"; printf '\n'
  elif [ "${SILENCIO:-0}" = 1 ]; then
    "$@" > /dev/null
  else
    "$@"
  fi
}

if ! gh auth status >/dev/null 2>&1; then
  echo "gh no está autenticado (gh auth login)" >&2
  exit 1
fi
if [ "$DRY_RUN" = 0 ]; then
  permiso="$(gh api "repos/$REPO" --jq .permissions.admin 2>/dev/null || echo false)"
  if [ "$permiso" != "true" ]; then
    echo "hace falta ser administrador de $REPO" >&2
    exit 1
  fi
fi

# 1. Etiquetas ----------------------------------------------------------------------------
log "Etiquetas"
while IFS='|' read -r nombre color descripcion; do
  correr gh label create "$nombre" --repo "$REPO" --force --color "$color" --description "$descripcion"
done <<'EOF'
datos-menor|0e8a16|Corrección chica de datos: se mergea sola al pasar el gate
datos-mayor|fbca04|Carga grande de datos: se mergea sola tras la ventana de espera
necesita-humano|d93f0b|Lo tiene que revisar una persona con permiso de merge
esperando|c5def5|PR de datos en la ventana de espera; el centinela lo mergea al vencer
ayuda-necesaria|0052cc|Falta un dato que cualquiera puede cargar por PR
dato-incorrecto|e99695|Aviso de un dato del sitio que no coincide con la fuente oficial
EOF

# 2. Ruleset «main» -----------------------------------------------------------------------
log "Ruleset «main» ($RULESET)"
existente="$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "main") | .id' 2>/dev/null | head -n 1 || true)"
if [ -n "$existente" ]; then
  echo "   ya existe (id $existente): se actualiza"
  SILENCIO=1 correr gh api -X PUT "repos/$REPO/rulesets/$existente" --input "$RULESET"
else
  SILENCIO=1 correr gh api -X POST "repos/$REPO/rulesets" --input "$RULESET"
fi

# 3. Permisos del GITHUB_TOKEN --------------------------------------------------------------
log "Permisos por defecto del GITHUB_TOKEN: solo lectura"
SILENCIO=1 correr gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

# 4. Pages por Actions ---------------------------------------------------------------------
log "Pages con origen GitHub Actions"
origen="$(gh api "repos/$REPO/pages" --jq .build_type 2>/dev/null || echo ninguno)"
if [ "$origen" = "workflow" ]; then
  echo "   ya está"
elif [ "$origen" = "ninguno" ]; then
  correr gh api -X POST "repos/$REPO/pages" -f build_type=workflow
else
  correr gh api -X PUT "repos/$REPO/pages" -f build_type=workflow
fi

# Estado final -------------------------------------------------------------------------------
if [ "$DRY_RUN" = 0 ]; then
  log "Estado"
  gh api "repos/$REPO/rulesets" --jq '.[] | "   ruleset \(.name): \(.enforcement)"'
  gh api "repos/$REPO/actions/permissions/workflow" --jq '"   token por defecto: \(.default_workflow_permissions)"'
  gh api "repos/$REPO/pages" --jq '"   pages: \(.build_type)"'
fi
