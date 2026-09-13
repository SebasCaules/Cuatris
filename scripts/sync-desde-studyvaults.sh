#!/usr/bin/env bash
#
# sync-desde-studyvaults.sh — trae al standalone la última versión del planner
# que vive en el repositorio StudyVaults (fuente de verdad del código).
#
# Copia UNA VÍA (StudyVaults → Cuatris) los directorios que se mantienen
# byte-idénticos entre ambos proyectos:
#   site/components/planner/    → components/planner/
#   site/lib/planner/           → lib/planner/          (sin data.json: se regenera)
#   site/lib/url-state/         → lib/url-state/
#   site/packages/ui/           → packages/ui/
#   site/public/electivas-fichas/ → public/electivas-fichas/
#   Electivas/{data.js, *.json, *.csv, *.py, *.md, scrape-sga-*.js} → data/plan/
#
# Lo que es propio del standalone (app/, components/shell/, lib/content/slug.ts,
# lib/site.ts, scripts/, next.config.ts) NO se toca. Los cambios locales que se
# hayan hecho dentro de los directorios sincronizados SE PISAN: revisar
# `git diff` antes de commitear y volver a aplicar lo que haya que conservar.
#
# Uso:  scripts/sync-desde-studyvaults.sh            (o `npm run sync`)
#       STUDYVAULTS_DIR=/otra/ruta scripts/sync-desde-studyvaults.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SV="${STUDYVAULTS_DIR:-$HOME/Desktop/ITBA/StudyVaultsITBA}"
SITE="$SV/site"
EL="$SV/Electivas"

if [ ! -d "$SITE/components/planner" ]; then
  echo "No encuentro el planner de StudyVaults en $SITE (fijá STUDYVAULTS_DIR)" >&2
  exit 1
fi

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }

sync_dir() { # origen destino [excluir…]
  local src="$1" dst="$2"; shift 2
  local args=(-a --delete)
  for x in "$@"; do args+=(--exclude "$x"); done
  mkdir -p "$dst"
  rsync "${args[@]}" "$src/" "$dst/"
  log "$dst  ←  $src"
}

sync_dir "$SITE/components/planner" "$ROOT/components/planner"
sync_dir "$SITE/lib/planner" "$ROOT/lib/planner" "data.json"
sync_dir "$SITE/lib/url-state" "$ROOT/lib/url-state"
sync_dir "$SITE/packages/ui" "$ROOT/packages/ui" "tsconfig.tsbuildinfo" "node_modules"
sync_dir "$SITE/public/electivas-fichas" "$ROOT/public/electivas-fichas"

mkdir -p "$ROOT/data/plan"
for f in Plan-S10-Rev23.md SCRAPING.md build-data.py data.js electivas.csv electivas.json \
         electivas.py horarios-all.json horarios.json obligatorias.csv obligatorias.json \
         scrape-sga-all.js scrape-sga-full.js scrape-sga-quick-test.js; do
  [ -f "$EL/$f" ] && cp "$EL/$f" "$ROOT/data/plan/$f"
done
for f in "$EL"/finales-*.csv; do
  [ -f "$f" ] && cp "$f" "$ROOT/data/plan/"
done
log "data/plan/  ←  $EL (build-resumenes.py NO se sincroniza: tiene rutas propias)"

log "Regenerando lib/planner/data.json"
(cd "$ROOT" && node scripts/build-planner-data.mjs)

echo
git -C "$ROOT" status --short | sed 's/^/   /'
echo
log "Revisá el diff (los cambios locales en los directorios sincronizados se pisaron) y luego typecheck + build."
